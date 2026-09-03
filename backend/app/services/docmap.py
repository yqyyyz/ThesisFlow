import hashlib
import json
import re

import numpy as np
from sqlalchemy.orm import Session

from app.core.llm import chat
from app.core.vectors import blob_to_vec
from app.models.literature import Chunk, Document, DocumentMap, Project


def _ready_docs(db: Session, project_id: int) -> list[Document]:
    return (
        db.query(Document)
        .filter(Document.project_id == project_id, Document.status == "ready")
        .order_by(Document.id)
        .all()
    )


def _doc_vectors(db: Session, docs: list[Document]) -> dict[int, np.ndarray]:
    vecs: dict[int, np.ndarray] = {}
    for d in docs:
        rows = (
            db.query(Chunk.embedding)
            .filter(Chunk.doc_id == d.id, Chunk.embedding.isnot(None))
            .all()
        )
        if not rows:
            continue
        mat = np.vstack([blob_to_vec(r[0]) for r in rows])
        v = mat.mean(axis=0)
        n = np.linalg.norm(v)
        if n > 0:
            vecs[d.id] = v / n
    return vecs


def map_signature(docs: list[Document]) -> str:
    raw = "|".join(f"{d.id}:{d.updated_at}" for d in docs)
    return hashlib.md5(raw.encode()).hexdigest()


def _doc_fingerprints(docs: list[Document]) -> dict[str, str]:
    return {str(d.id): str(d.updated_at) for d in docs}


def _stale_docs(docs: list[Document], stored: DocumentMap | None) -> list[int]:
    """返回未纳入当前图谱缓存的新文献 id"""
    if stored is None:
        return [d.id for d in docs]
    fingers = (stored.map_json or {}).get("_sig", {})
    stale = []
    for d in docs:
        if str(d.id) not in fingers or fingers[str(d.id)] != str(d.updated_at):
            stale.append(d.id)
    return stale


def read_doc_map(db: Session, project: Project) -> dict:
    """只读缓存，绝不触发重新生成"""
    docs = _ready_docs(db, project.id)
    if len(docs) == 0:
        return {"map": {"clusters": [], "edges": [], "narrative": "", "nodes": []},
                "stale": False, "new_doc_ids": [], "has_cache": False}
    stored = (
        db.query(DocumentMap)
        .filter(DocumentMap.project_id == project.id)
        .order_by(DocumentMap.id.desc())
        .first()
    )
    if stored is None:
        return {"map": None, "stale": False, "new_doc_ids": [d.id for d in docs],
                "has_cache": False}
    stale_ids = _stale_docs(docs, stored)
    return {"map": stored.map_json, "stale": len(stale_ids) > 0,
            "new_doc_ids": stale_ids, "has_cache": True}


def regenerate_doc_map(db: Session, project: Project) -> dict:
    docs = _ready_docs(db, project.id)
    if len(docs) == 0:
        return {"clusters": [], "edges": [], "narrative": "", "nodes": []}
    sig = map_signature(docs)
    graph = _generate_map(db, project, docs)
    graph["_sig"] = _doc_fingerprints(docs)
    stored = (
        db.query(DocumentMap)
        .filter(DocumentMap.project_id == project.id)
        .order_by(DocumentMap.id.desc())
        .first()
    )
    if stored:
        db.delete(stored)
    db.add(DocumentMap(project_id=project.id, signature=sig, map_json=graph))
    db.commit()
    return graph


def _generate_map(db: Session, project: Project, docs: list[Document]) -> dict:
    vecs = _doc_vectors(db, docs)
    sims: list[str] = []
    ids = list(vecs.keys())
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            sim = float(np.dot(vecs[ids[i]], vecs[ids[j]]))
            if sim >= 0.35:
                sims.append(f"- 文献{ids[i]} 与 文献{ids[j]} 内容相似度 {sim:.2f}")

    digests = []
    for d in docs:
        summary = (d.summary_cache or "").replace("<!--PREREAD-->", "")[:180]
        digests.append(
            f"- 文献{d.id}：《{d.title or d.file_name}》"
            f"{('（' + str(d.venue) + '）') if d.venue else ''}\n  要点：{summary or '（无）'}"
        )

    prompt = f"""你是文献计量与知识图谱专家。请基于以下项目内的文献信息，梳理文献脉络，构建一份结构化的文献知识图谱。

研究问题：{project.research_question or "（未设定）"}

文献清单：
{chr(10).join(digests)}

文献间内容相似度（由向量模型计算，仅供参考）：
{chr(10).join(sims) if sims else "（无显著相似对）"}

只输出 JSON（不要代码块），格式：
{{
  "narrative": "200-350字的文献脉络叙述：按时间或逻辑梳理这批文献如何构成该研究问题的知识基础，指出演进脉络与当前缺口",
  "clusters": [
    {{
      "id": 1,
      "label": "脉络分支名称（如：理论源流 / 方法演进 / 应用场景）",
      "summary": "分支短概括（40-80字）",
      "summary_l1": "分支结构化长摘要（120-200字）：该分支的核心问题、代表文献及贡献、方法特征、与其他分支的关系",
      "doc_ids": [属于该分支的文献 id]
    }}
  ],
  "edges": [
    {{
      "source": 文献id,
      "target": 文献id,
      "relation": "extends|supports|contrasts|background|same_topic",
      "label": "不超过8字的关系说明"
    }}
  ]
}}

要求：
1. 每篇文献必须且只能归入一个分支；分支 2-4 个；
2. edges 只在确有学术关系时建立（参考相似度但不唯相似度），不超过 8 条；
3. relation 取值严格限定为 extends（扩展）/supports（支持）/contrasts（对照）/background（背景）/same_topic（同主题）；
4. 只输出 JSON。"""

    raw = chat("STRONG", [{"role": "user", "content": prompt}], temperature=0.4, json_mode=True)
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        result = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        result = {}
    valid_ids = {d.id for d in docs}
    result["clusters"] = [
        c
        for c in result.get("clusters", [])
        if isinstance(c, dict) and c.get("doc_ids")
    ]
    for c in result["clusters"]:
        c["doc_ids"] = [i for i in c["doc_ids"] if i in valid_ids]
    result["edges"] = [
        e
        for e in result.get("edges", [])
        if isinstance(e, dict)
        and e.get("source") in valid_ids
        and e.get("target") in valid_ids
    ]
    result["nodes"] = [
        {
            "id": d.id,
            "title": d.title or d.file_name or f"文档 {d.id}",
            "venue": d.venue,
            "year": d.year,
            "weighted_score": (
                sum(v["score"] for v in d.scores.values()) / max(len(d.scores), 1)
                if d.scores
                else None
            ),
            "summary": (d.summary_cache or "").replace("<!--PREREAD-->", "")[:200],
        }
        for d in docs
    ]
    result.setdefault("narrative", "")
    return result


def delta_update(db: Session, project: Project, new_doc: Document) -> bool:
    """新文献入库时的增量合入：就近聚类 + LIGHT 合并摘要。返回是否执行"""
    from app.core.llm import chat as _chat

    stored = (
        db.query(DocumentMap)
        .filter(DocumentMap.project_id == project.id)
        .order_by(DocumentMap.id.desc())
        .first()
    )
    if not stored or not stored.map_json or not stored.map_json.get("clusters"):
        return False
    data = stored.map_json
    if not isinstance(data, dict):
        return False
    digest = (new_doc.summary_cache or "").replace("<!--PREREAD-->", "")[:200]
    doc_desc = f"《{new_doc.title}》{digest}"
    clusters = data["clusters"]

    from app.core.llm import embed as _embed
    from app.core.vectors import cosine_similarity as _cos

    best_idx = 0
    best_sim = -1.0
    try:
        doc_vec = _embed([doc_desc])[0]
        for i, cl in enumerate(clusters):
            cl_text = f"{cl.get('label','')} {cl.get('summary','')}"
            cl_vec = _embed([cl_text])[0]
            sim = _cos(doc_vec, cl_vec)
            if sim > best_sim:
                best_sim = sim
                best_idx = i
    except Exception:
        pass

    target = clusters[best_idx]
    try:
        merged = _chat(
            "LIGHT",
            [
                {
                    "role": "user",
                    "content": (
                        f"下面是文献图谱分支「{target.get('label','')}」的当前摘要，以及新加入的一篇文献。\n"
                        f"当前摘要：{target.get('summary_l1') or target.get('summary','')}\n"
                        f"新文献：{doc_desc}\n\n"
                        "请将新文献的信息增量合并进摘要，输出更新后的摘要（120-200字），不要重复无关内容，只输出摘要文本。"
                    ),
                }
            ],
            temperature=0.3,
        ).strip()
        if merged:
            target["summary_l1"] = merged[:300]
    except Exception:
        pass

    if new_doc.id not in target.get("doc_ids", []):
        target.setdefault("doc_ids", []).append(new_doc.id)
    nodes = data.setdefault("nodes", [])
    if not any(n.get("id") == new_doc.id for n in nodes):
        nodes.append(
            {
                "id": new_doc.id,
                "title": new_doc.title or new_doc.file_name or f"文档 {new_doc.id}",
                "summary": digest,
            }
        )
    sig_parts = data.setdefault("_sig", {})
    sig_parts[str(new_doc.id)] = str(new_doc.updated_at)
    stored.map_json = data
    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(stored, "map_json")
    db.commit()
    return True


def deep_extract_edges(db: Session, project: Project, query: str) -> dict:
    """按需深抽取：对相关文献子集调用 STRONG 抽取带证据的关系边"""
    import re as _re

    import jieba.analyse

    from app.core.llm import chat as _chat
    from app.models.caching import ChunkEntity, GraphEdge
    from app.models.literature import Chunk as _Chunk

    keywords = set(jieba.analyse.extract_tags(query[:500], topK=8))
    docs = _ready_docs(db, project.id)
    if not docs:
        return {"edges": [], "doc_ids": []}
    doc_scores: dict[int, float] = {}
    for d in docs:
        ents = (
            db.query(ChunkEntity.entity)
            .filter(ChunkEntity.doc_id == d.id)
            .distinct()
            .all()
        )
        overlap = sum(1 for (e,) in ents if e in keywords or any(k in e for k in keywords))
        title_hit = sum(1 for k in keywords if d.title and k in d.title)
        doc_scores[d.id] = overlap + title_hit * 2
    ranked = sorted(doc_scores.items(), key=lambda x: -x[1])
    chosen = [did for did, s in ranked[:6] if s > 0] or [ranked[0][0]] if ranked else []
    if not chosen:
        return {"edges": [], "doc_ids": []}

    chosen_docs = [d for d in docs if d.id in chosen]
    lines = []
    for d in chosen_docs:
        abstract_row = (
            db.query(_Chunk)
            .filter(_Chunk.doc_id == d.id, _Chunk.typed_label == "abstract")
            .first()
        )
        abstract_txt = (abstract_row.content[:300] if abstract_row else "") or (
            (d.summary_cache or "").replace("<!--PREREAD-->", "")[:200]
        )
        lines.append(f"文献{d.id}：《{d.title or d.file_name}》\n  摘要：{abstract_txt}")

    prompt = f"""请基于以下文献的摘要，抽取它们之间的学术关系边。

{chr(10).join(lines)}

只输出 JSON 数组，元素格式：
{{"source": 文献id, "target": 文献id, "relation": "extends|supports|contrasts|background|same_topic", "label": "不超过8字说明", "evidence": "依据短语(10-30字)"}}

要求：只输出确有依据的关系，不超过 6 条；无关系则输出空数组。"""
    try:
        raw = _chat("STRONG", [{"role": "user", "content": prompt}], temperature=0.2, json_mode=True)
        m = _re.search(r"\[.*\]", raw, _re.S)
        edges_parsed = json.loads(m.group(0)) if m else []
    except Exception:
        edges_parsed = []

    added = []
    valid_ids = set(chosen)
    for e in edges_parsed:
        if not isinstance(e, dict):
            continue
        s, t = e.get("source"), e.get("target")
        if s not in valid_ids or t not in valid_ids or s == t:
            continue
        if e.get("relation") not in ("extends", "supports", "contrasts", "background", "same_topic"):
            continue
        exists = (
            db.query(GraphEdge)
            .filter(
                GraphEdge.project_id == project.id,
                GraphEdge.source_doc == s,
                GraphEdge.target_doc == t,
            )
            .first()
        )
        if exists:
            continue
        row = GraphEdge(
            project_id=project.id,
            source_doc=s,
            target_doc=t,
            relation=e["relation"],
            label=str(e.get("label", ""))[:24],
            evidence_chunks=[str(e.get("evidence", ""))[:60]],
            model="deep_extract_strong",
        )
        db.add(row)
        added.append(e)
    db.commit()
    return {"edges": added, "doc_ids": chosen}
