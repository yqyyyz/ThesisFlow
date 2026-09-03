import re

import numpy as np
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

from app.core.llm import embed, rerank
from app.core.vectors import blob_to_vec
from app.models.literature import Chunk, Document
from app.services.scoring import weighted_total

TIER_WEIGHTS = {"top": 2.0, "mid": 1.2, "base": 0.8}
MODE_BUDGETS = {
    "drafting": {"rag_chars": 12000, "max_chunks": 12},
    "writing": {"rag_chars": 9000, "max_chunks": 8},
    "review": {"rag_chars": 0, "max_chunks": 0},
}


def _load_project_chunks(db: Session, project_id: int) -> list[Chunk]:
    """检索单元：子块（有 parent_key）+ typed 单粒度块；排除父块（仅装配用）"""
    return (
        db.query(Chunk)
        .join(Document, Chunk.doc_id == Document.id)
        .filter(Document.project_id == project_id)
        .filter((Chunk.parent_key.isnot(None)) | (Chunk.typed_label != "body"))
        .all()
    )


def _dense_search(query: str, chunks: list[Chunk], top_k: int) -> dict[str, float]:
    embedded = [c for c in chunks if c.embedding]
    if not embedded:
        return {}
    try:
        qvec = embed([query])[0]
    except Exception:
        return {}
    keys = [c.chunk_key for c in embedded]
    mat = np.vstack([blob_to_vec(c.embedding) for c in embedded])
    norms = np.linalg.norm(mat, axis=1)
    norms[norms == 0] = 1.0
    qn = np.linalg.norm(qvec)
    if qn == 0:
        return {}
    scores = mat @ qvec / (norms * qn)
    order = np.argsort(-scores)[:top_k]
    return {keys[i]: float(scores[i]) for i in order}


def _sparse_search(db: Session, project_id: int, query: str, top_k: int) -> dict[str, float]:
    import jieba

    tokens = [t for t in jieba.cut_for_search(query) if len(t.strip()) >= 2]
    if not tokens:
        return {}
    match_expr = " OR ".join(f'"{t}"' for t in tokens[:12])
    doc_ids = [
        d.id for d in db.query(Document.id).filter(Document.project_id == project_id).all()
    ]
    if not doc_ids:
        return {}
    id_list = ",".join(str(int(i)) for i in doc_ids)
    try:
        rows = db.execute(
            sql_text(
                f"""
                SELECT chunk_key, bm25(chunks_fts) AS score
                FROM chunks_fts
                WHERE chunks_fts MATCH :q AND doc_id IN ({id_list})
                ORDER BY score LIMIT :k
                """
            ),
            {"q": match_expr, "k": top_k},
        ).fetchall()
    except Exception:
        return {}
    return {r.chunk_key: float(-r.score) for r in rows}


def _rrf(rank_lists: list[dict[str, float]], k: int = 60) -> dict[str, float]:
    fused: dict[str, float] = {}
    for scores in rank_lists:
        ranked = sorted(scores.items(), key=lambda kv: -kv[1])
        for rank, (key, _) in enumerate(ranked):
            fused[key] = fused.get(key, 0.0) + 1.0 / (k + rank + 1)
    return fused


def detect_explicit_doc(query: str, db: Session, project_id: int) -> int | None:
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    for d in docs:
        if d.title and d.title.lower() in query.lower():
            return d.id
    m = re.search(r"文献\s*(?:ID\s*)?[#＃]?(\d+)", query)
    if m:
        cand = int(m.group(1))
        if any(d.id == cand for d in docs):
            return cand
    return None


def retrieve(
    db: Session,
    project_id: int,
    query: str,
    mode: str = "writing",
    top_k: int = 12,
) -> list[dict]:
    budget = MODE_BUDGETS.get(mode, MODE_BUDGETS["writing"])
    if budget["max_chunks"] == 0:
        return []

    chunks = _load_project_chunks(db, project_id)
    chunk_map = {c.chunk_key: c for c in chunks}
    doc_cache: dict[int, Document] = {}

    def doc_of(chunk: Chunk) -> Document:
        if chunk.doc_id not in doc_cache:
            doc_cache[chunk.doc_id] = db.get(Document, chunk.doc_id)
        return doc_cache[chunk.doc_id]

    explicit_doc = detect_explicit_doc(query, db, project_id)
    if explicit_doc:
        candidates = [c for c in chunks if c.doc_id == explicit_doc]
    else:
        dense = _dense_search(query, chunks, top_k * 4)
        sparse = _sparse_search(db, project_id, query, top_k * 4)
        fused = _rrf([dense, sparse])
        cand_keys = list(fused.keys())

        def doc_weight(chunk: Chunk) -> float:
            if chunk.tier >= 2:
                return TIER_WEIGHTS["top"]
            doc = doc_of(chunk)
            if doc and doc.scores and weighted_total(doc.scores) >= 4:
                return TIER_WEIGHTS["mid"]
            return TIER_WEIGHTS["base"]

        weighted = {k: fused[k] * doc_weight(chunk_map[k]) for k in cand_keys if k in chunk_map}
        rr = rerank(query, [chunk_map[k].content[:500] for k in weighted], top_n=len(weighted))
        if rr:
            keys_in_order = list(weighted.keys())
            rer_score = {k: 0.0 for k in keys_in_order}
            for item in rr:
                if 0 <= item["index"] < len(keys_in_order):
                    rer_score[keys_in_order[item["index"]]] = item["score"]
            cand_keys = sorted(keys_in_order, key=lambda k: -rer_score[k])
        else:
            cand_keys = sorted(weighted.keys(), key=lambda k: -weighted[k])
        candidates = [chunk_map[k] for k in cand_keys if k in chunk_map]

    selected: list[dict] = []
    used_chars = 0
    used_parents: set[str] = set()
    parent_cache: dict[str, Chunk | None] = {}
    for c in candidates:
        if len(selected) >= budget["max_chunks"]:
            break
        content = c.content
        parent_key = c.parent_key
        if parent_key:
            if parent_key in used_parents:
                continue
            parent = parent_cache.get(parent_key)
            if parent is None and parent_key not in parent_cache:
                parent = (
                    db.query(Chunk).filter(Chunk.chunk_key == parent_key).first()
                )
                parent_cache[parent_key] = parent
            if parent:
                used_parents.add(parent_key)
                content = parent.content
        snippet = content[:2400]
        if used_chars + len(snippet) > budget["rag_chars"]:
            continue
        used_chars += len(snippet)
        doc = doc_of(c)
        selected.append(
            {
                "chunk_key": c.chunk_key,
                "doc_id": c.doc_id,
                "doc_title": doc.title if doc else "",
                "section_title": c.section_title or "",
                "page_no": c.page_no,
                "tier": c.tier,
                "content": snippet,
            }
        )
    return selected


def format_context_block(retrieved: list[dict]) -> str:
    lines = []
    for item in retrieved:
        lines.append(
            f"[{item['chunk_key']}] 《{item['doc_title']}》"
            f"{(' · ' + item['section_title']) if item['section_title'] else ''}"
            f"{' · p.' + str(item['page_no']) if item['page_no'] else ''}\n{item['content']}"
        )
    return "\n\n".join(lines)


# ---------- 意图路由矩阵 ----------

def _latest_docmap(db: Session, project_id: int):
    from app.models.literature import DocumentMap

    return (
        db.query(DocumentMap)
        .filter(DocumentMap.project_id == project_id)
        .order_by(DocumentMap.id.desc())
        .first()
    )


def _load_doc_map(db: Session, project_id: int) -> list[Chunk]:
    return (
        db.query(Chunk)
        .join(Document, Chunk.doc_id == Document.id)
        .filter(Document.project_id == project_id)
        .filter(Chunk.typed_label.in_(["abstract", "conclusion"]))
        .all()
    )


def _chunks_to_items(db: Session, chunks: list[Chunk], budget_chars: int, max_items: int) -> list[dict]:
    doc_cache: dict[int, Document] = {}
    selected: list[dict] = []
    used = 0
    for c in chunks:
        if len(selected) >= max_items:
            break
        snippet = c.content[:1200]
        if used + len(snippet) > budget_chars:
            continue
        used += len(snippet)
        if c.doc_id not in doc_cache:
            doc_cache[c.doc_id] = db.get(Document, c.doc_id)
        doc = doc_cache[c.doc_id]
        selected.append(
            {
                "chunk_key": c.chunk_key,
                "doc_id": c.doc_id,
                "doc_title": doc.title if doc else "",
                "section_title": c.section_title or "",
                "page_no": c.page_no,
                "tier": c.tier,
                "content": snippet,
            }
        )
    return selected


def _retrieve_multihop(
    db: Session, project_id: int, query: str, budget: dict
) -> tuple[list[dict], list[int]]:
    """多跳：按 docmap 聚类定位相关文献子集，取其摘要/结论+正文定点块"""
    import jieba.analyse

    docmap_row = _latest_docmap(db, project_id)
    clusters_used: list[int] = []
    target_doc_ids: set[int] = set()
    if docmap_row and docmap_row.map_json:
        keywords = set(jieba.analyse.extract_tags(query, topK=6))
        clusters = docmap_row.map_json.get("clusters", [])
        scored = []
        for cl in clusters:
            text_blob = f"{cl.get('label', '')} {cl.get('summary', '')} {cl.get('summary_l1', '')}"
            overlap = sum(1 for kw in keywords if kw in text_blob)
            scored.append((overlap, cl))
        scored.sort(key=lambda x: -x[0])
        for overlap, cl in scored[:2]:
            if overlap > 0 or len(scored) <= 2:
                clusters_used.append(cl.get("id"))
                target_doc_ids.update(cl.get("doc_ids", []))
    if not target_doc_ids:
        return [], clusters_used

    chunks = (
        db.query(Chunk)
        .filter(Chunk.doc_id.in_(list(target_doc_ids)))
        .order_by(Chunk.doc_id, Chunk.id)
        .all()
    )
    priority = {"abstract": 0, "conclusion": 1, "body": 2, "refs": 3}
    chunks.sort(key=lambda c: (priority.get(c.typed_label, 9), c.id))
    return _chunks_to_items(db, chunks[: budget["max_chunks"] * 2], budget["rag_chars"], budget["max_chunks"]), clusters_used


def _retrieve_global(db: Session, project_id: int, budget: dict) -> tuple[list[dict], list[int]]:
    """全局：物化聚类摘要 + 文献骨干摘要，不取原文细节块"""
    docmap_row = _latest_docmap(db, project_id)
    items: list[dict] = []
    clusters_used: list[int] = []
    if docmap_row and docmap_row.map_json:
        narrative = docmap_row.map_json.get("narrative", "")
        if narrative:
            items.append(
                {
                    "chunk_key": "map:overview",
                    "doc_id": 0,
                    "doc_title": "领域脉络总览（物化摘要）",
                    "section_title": "",
                    "page_no": None,
                    "tier": 0,
                    "content": narrative[:1200],
                }
            )
        for cl in docmap_row.map_json.get("clusters", []):
            summary = cl.get("summary_l1") or cl.get("summary", "")
            if not summary:
                continue
            clusters_used.append(cl.get("id"))
            items.append(
                {
                    "chunk_key": f"map:cluster:{cl.get('id')}",
                    "doc_id": 0,
                    "doc_title": f"聚类：{cl.get('label', '')}",
                    "section_title": "",
                    "page_no": None,
                    "tier": 0,
                    "content": summary[:800],
                }
            )
    docs = (
        db.query(Document)
        .filter(Document.project_id == project_id, Document.status == "ready")
        .all()
    )
    for d in docs[:8]:
        abstract_chunk = (
            db.query(Chunk)
            .filter(Chunk.doc_id == d.id, Chunk.typed_label == "abstract")
            .first()
        )
        digest = (d.summary_cache or "").replace("<!--PREREAD-->", "")[:400]
        content = digest or (abstract_chunk.content[:400] if abstract_chunk else "")
        if not content:
            continue
        items.append(
            {
                "chunk_key": f"digest:{d.id}",
                "doc_id": d.id,
                "doc_title": d.title or f"文档 {d.id}",
                "section_title": "骨干摘要",
                "page_no": None,
                "tier": 0,
                "content": content,
            }
        )
    used = 0
    trimmed: list[dict] = []
    for it in items:
        if used + len(it["content"]) > budget["rag_chars"] or len(trimmed) >= budget["max_chunks"]:
            break
        used += len(it["content"])
        trimmed.append(it)
    return trimmed, clusters_used


def retrieve_for_intent(
    db: Session,
    project_id: int,
    query: str,
    intent: str,
    mode: str = "writing",
    top_k: int = 12,
) -> dict:
    budget = MODE_BUDGETS.get(mode, MODE_BUDGETS["writing"])
    if intent == "multi_hop":
        chunks, clusters_used = _retrieve_multihop(db, project_id, query, budget)
        if chunks:
            return {"chunks": chunks, "route": "multi_hop", "clusters_used": clusters_used}
        # 聚类信息不足时降级为事实检索
    if intent == "global":
        chunks, clusters_used = _retrieve_global(db, project_id, budget)
        if chunks:
            return {"chunks": chunks, "route": "global", "clusters_used": clusters_used}
    return {
        "chunks": retrieve(db, project_id, query, mode, top_k),
        "route": "fact",
        "clusters_used": [],
    }
