import logging
from pathlib import Path

from app.config import UPLOAD_DIR, settings
from app.core.llm import approx_tokens, embed
from app.core.vectors import blob_to_vec, cosine_similarity, vec_to_blob
from app.database import SessionLocal
from app.models.literature import Chunk, Document
from app.models.user import User
from app.services import parsing
from app.services.chunking import build_chunks_v2
from app.services.crossref import resolve_doi
from app.services.scoring import all_dimensions, score_document, weighted_total

logger = logging.getLogger("thesisflow.ingestion")

EMBED_BATCH = 10


def _insert_fts_bulk(conn, doc_id: int, chunk_rows: list[tuple[str, str]]) -> None:
    import jieba
    from sqlalchemy import text

    params = [
        {
            "doc_id": str(doc_id),
            "chunk_key": chunk_key,
            "fts_text": " ".join(jieba.cut_for_search(text_)),
        }
        for chunk_key, text_ in chunk_rows
    ]
    conn.execute(
        text(
            "INSERT INTO chunks_fts (doc_id, chunk_key, fts_text) "
            "VALUES (:doc_id, :chunk_key, :fts_text)"
        ),
        params,
    )


def _format_meta(doc: Document) -> str:
    parts = []
    if doc.title:
        parts.append(f"标题：{doc.title}")
    if doc.venue:
        parts.append(f"发表：{doc.venue}")
    if doc.year:
        parts.append(f"年份：{doc.year}")
    if doc.cited_by is not None:
        parts.append(f"被引量：{doc.cited_by}")
    if doc.authors:
        parts.append("作者：" + ", ".join(doc.authors[:6]))
    return "\n".join(parts)


def _dedup_check(db, doc: Document) -> Document | None:
    if doc.doi:
        existing = (
            db.query(Document)
            .filter(Document.doi == doc.doi, Document.id != doc.id)
            .first()
        )
        if existing:
            return existing
    return None


def _title_dedup(db, doc: Document, title: str) -> Document | None:
    if not title.strip():
        return None
    try:
        title_vec = embed([title])[0]
    except Exception:
        return None
    doc.title_embedding = vec_to_blob(title_vec)
    query = db.query(Document).filter(Document.id != doc.id)
    if doc.project_id:
        query = query.filter(Document.project_id == doc.project_id)
    for other in query.all():
        if not other.title_embedding or not other.title:
            continue
        sim = cosine_similarity(title_vec, blob_to_vec(other.title_embedding))
        if sim >= settings.dedup_similarity_threshold:
            return other
    return None


def run_pipeline(document_id: int) -> None:
    try:
        with SessionLocal() as db:
            doc = db.get(Document, document_id)
            if not doc:
                return
            _run_pipeline_sync(db, doc)
    except Exception as e:
        logger.exception("ingestion failed for doc %s", document_id)
        msg = f"{type(e).__name__}: {e}"[:500]
        try:
            with SessionLocal() as db:
                doc = db.get(Document, document_id)
                if doc:
                    doc.status = "failed"
                    doc.error_msg = msg
                    db.commit()
        except Exception:
            logger.exception("failed to persist failure status for doc %s", document_id)


def _delete_duplicate(db, doc: Document, reason: str) -> None:
    if doc.file_key:
        path = UPLOAD_DIR / doc.file_key
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass
    logger.info("duplicate removed: doc %s (%s)", doc.id, reason)
    db.delete(doc)
    db.commit()


def _run_pipeline_sync(db, doc: Document) -> None:
    def set_status(status: str) -> None:
        doc.status = status
        db.commit()

    set_status("dedup_checked")
    dup = _dedup_check(db, doc)
    if dup:
        _delete_duplicate(db, doc, f"DOI 与《{dup.title or dup.id}》相同")
        return

    path = UPLOAD_DIR / doc.file_key if doc.file_key else None
    if not path or not path.exists():
        raise FileNotFoundError("文献文件缺失")

    ext = path.suffix.lower()
    set_status("parsing")

    if ext == ".docx":
        from app.services.docparse import parse_docx

        doc.kind = "docx"
        parsed = parse_docx(path)
        doc.content_struct = parsed["content_struct"]
        doc.title = parsed["title_guess"] or doc.file_name
        doc.word_count = len(parsed["full_text"])
        sections, abstract, refs = parsed["sections"], "", ""
    elif ext == ".md":
        from app.services.docparse import parse_markdown

        doc.kind = "md"
        parsed = parse_markdown(path)
        doc.content_struct = parsed["content_struct"]
        doc.title = parsed["title_guess"] or doc.file_name
        doc.word_count = len(parsed["full_text"])
        sections, abstract, refs = parsed["sections"], "", ""
    else:
        doc.kind = "pdf"
        result = parsing.parse_pdf(path)
        if result.pdf_type == "scanned":
            raise ValueError(
                "扫描版 PDF 暂不支持（Demo 未启用 OCR），请提供文本型 PDF 或 Word/Markdown 格式"
            )
        doc.pdf_type = result.pdf_type
        if not doc.title:
            doc.title = result.title_guess or doc.file_name
        if result.title_confidence == "low" and result.full_text:
            try:
                from app.core.llm import chat

                refined = chat(
                    "LIGHT",
                    [
                        {
                            "role": "user",
                            "content": (
                                "以下是学术论文开头部分的文本。请提取这篇论文的准确标题，"
                                "只输出标题本身，不要任何前缀或解释：\n"
                                + result.full_text[:800]
                            ),
                        }
                    ],
                    temperature=0.1,
                ).strip().strip('"').strip()
                if 4 < len(refined) < 300 and "\n" not in refined:
                    doc.title = refined
                    logger.info("doc %s title refined by LLM: %s", doc.id, refined[:60])
            except Exception:
                logger.exception("title refinement failed for doc %s", doc.id)
        doc.word_count = len(result.full_text)
        sections, abstract, refs = result.sections, result.abstract, result.references_text

    dup_by_title = _title_dedup(db, doc, doc.title or "")
    if dup_by_title:
        _delete_duplicate(
            db, doc, f"标题相似度超标，参照《{dup_by_title.title}》"
        )
        return

    set_status("chunked")
    drafts = build_chunks_v2(doc.id, sections, abstract, refs)
    if not drafts:
        raise ValueError("解析结果为空，无法切片")

    chunks: list[Chunk] = []
    for d in drafts:
        bbox = None
        if doc.kind == "pdf" and not d["is_parent"]:
            bbox = parsing.locate_bbox(path, d["content"][:80], d["page_no"])
        chunks.append(
            Chunk(
                doc_id=doc.id,
                chunk_key=d["chunk_key"],
                content=d["content"],
                section_title=d["section_title"],
                typed_label=d["typed_label"],
                page_no=d["page_no"],
                char_start=d["char_start"],
                char_end=d["char_end"],
                bbox=bbox,
                tier=0,
                parent_key=d["parent_key"],
                token_count=approx_tokens(d["content"]),
            )
        )
    db.add_all(chunks)
    db.commit()

    set_status("embedding")
    embeddable = [c for c in chunks if c.parent_key is not None or c.typed_label != "body"]
    texts = [c.content for c in embeddable]
    vectors = []
    for i in range(0, len(texts), EMBED_BATCH):
        vectors.extend(embed(texts[i : i + EMBED_BATCH]))
    for c, v in zip(embeddable, vectors):
        c.embedding = vec_to_blob(v)
    db.commit()

    _insert_fts_bulk(
        db.connection(), doc.id, [(c.chunk_key, c.content) for c in embeddable]
    )
    db.commit()

    try:
        import jieba.analyse

        from app.models.caching import ChunkEntity

        entities_rows = []
        for c in embeddable:
            if c.typed_label == "refs":
                continue
            for ent, w in jieba.analyse.textrank(
                c.content[:1200], topK=5, withWeight=True
            ):
                if len(ent) < 2:
                    continue
                entities_rows.append(
                    ChunkEntity(
                        chunk_key=c.chunk_key,
                        doc_id=doc.id,
                        entity=ent,
                        weight=float(w),
                    )
                )
        if entities_rows:
            db.add_all(entities_rows)
            db.commit()
    except Exception:
        logger.exception("entity extraction failed for doc %s", doc.id)

    set_status("scoring")
    project = None
    if doc.project_id:
        from app.models.literature import Project

        project = db.get(Project, doc.project_id)

    abstract = abstract or next(
        (c.content for c in chunks if c.typed_label == "abstract"), ""
    )
    conclusion = next((c.content for c in chunks if c.typed_label == "conclusion"), "")
    meta = _format_meta(doc)

    profile_anchor = ""
    user = db.get(User, doc.user_id)
    if user:
        from app.services.scoring import pick_anchor

        profile_anchor = pick_anchor(user.discipline)
    research_question = project.research_question if project else ""
    if profile_anchor:
        research_question = f"{profile_anchor}\n{research_question}"

    from app.services.scoring import load_calibration_samples

    doc.scores = score_document(
        meta,
        abstract,
        conclusion[:2000],
        research_question,
        all_dimensions(project),
        calibration=load_calibration_samples(db, doc.user_id),
    )
    if abstract:
        doc.summary_cache = abstract[:1000]
    doc.status = "ready"
    doc.error_msg = None
    db.commit()
    logger.info("doc %s ready, weighted=%s", doc.id, weighted_total(doc.scores))

    try:
        from app.core.cache import invalidate_scope

        invalidate_scope(db, f"reading:doc:{doc.id}")
        if doc.project_id:
            invalidate_scope(db, f"project:{doc.project_id}")
    except Exception:
        logger.exception("cache invalidation failed for doc %s", doc.id)

    if doc.project_id:
        try:
            from app.models.literature import Project as _Project
            from app.services.docmap import delta_update

            proj = db.get(_Project, doc.project_id)
            if proj:
                delta_update(db, proj, doc)
        except Exception:
            logger.exception("docmap delta update failed for doc %s", doc.id)

    if doc.project_id is None:
        try:
            from app.services.home import gen_insight_for_doc

            gen_insight_for_doc(db, doc)
        except Exception:
            logger.exception("insight generation failed for doc %s", doc.id)


async def enrich_from_doi(db, doc: Document) -> None:
    if not doc.doi:
        return
    meta = await resolve_doi(doc.doi)
    if not meta:
        return
    if not doc.title and meta.get("title"):
        doc.title = meta["title"]
    doc.authors = doc.authors or meta.get("authors")
    doc.venue = doc.venue or meta.get("venue")
    doc.year = doc.year or meta.get("year")
    doc.cited_by = doc.cited_by if doc.cited_by is not None else meta.get("cited_by")
    db.commit()
