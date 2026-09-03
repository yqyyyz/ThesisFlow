import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR
from app.database import get_db
from app.models.literature import Annotation, Chunk, Document
from app.models.user import UserLog
from app.schemas.reading import (
    AnnotationCreate,
    AnnotationOut,
    ChunkOut,
    ExplainRequest,
    PreReadOut,
)
from app.services.parsing import locate_bbox
from app.services.reading import (
    TAG_LABELS,
    explain_concept,
    find_chunk_for_quote,
    generate_pre_read,
    promote_chunk_tier,
)

router = APIRouter(prefix="/api", tags=["reading"])


def _get_doc(db: Session, document_id: int) -> Document:
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "文献不存在")
    return doc


@router.get("/documents/{document_id}/chunks", response_model=list[ChunkOut])
def list_chunks(document_id: int, db: Session = Depends(get_db)):
    _get_doc(db, document_id)
    chunks = (
        db.query(Chunk)
        .filter(Chunk.doc_id == document_id)
        .order_by(Chunk.id)
        .all()
    )
    return chunks


PREREAD_SENTINEL = "<!--PREREAD-->"


@router.get("/documents/{document_id}/pre-read", response_model=PreReadOut)
def pre_read(document_id: int, db: Session = Depends(get_db)):
    doc = _get_doc(db, document_id)
    structured = None
    if doc.summary_cache and doc.summary_cache.startswith(PREREAD_SENTINEL):
        markdown = doc.summary_cache[len(PREREAD_SENTINEL):]
        try:
            parsed = json.loads(markdown)
            if isinstance(parsed, dict):
                structured = parsed
                markdown = ""
        except json.JSONDecodeError:
            pass
    else:
        markdown, structured = generate_pre_read(db, doc)
        cache_value = json.dumps(structured, ensure_ascii=False) if structured else markdown
        doc.summary_cache = PREREAD_SENTINEL + cache_value
        db.commit()
    reasons = None
    if doc.scores:
        reasons = {dim: v.get("reason", "") for dim, v in doc.scores.items()}
    return PreReadOut(
        doc_id=doc.id,
        title=doc.title,
        markdown=markdown,
        structured=structured,
        scores=doc.scores,
        score_reasons=reasons,
    )


@router.post("/documents/{document_id}/annotations", response_model=AnnotationOut)
def create_annotation(
    document_id: int,
    payload: AnnotationCreate,
    db: Session = Depends(get_db),
):
    doc = _get_doc(db, document_id)
    if payload.kind not in ("highlight", "tag", "note"):
        raise HTTPException(422, "kind 必须为 highlight / tag / note")
    if payload.kind == "tag" and payload.tag_label and payload.tag_label not in TAG_LABELS:
        raise HTTPException(422, f"tag_label 必须为 {TAG_LABELS} 之一")

    chunk_key = payload.chunk_key
    if not chunk_key and payload.quote_text:
        matched = find_chunk_for_quote(db, doc.id, payload.quote_text)
        if matched:
            chunk_key = matched.chunk_key

    bbox = None
    if payload.bbox and isinstance(payload.bbox, dict) and payload.bbox.get("rects"):
        bbox = payload.bbox
    elif payload.quote_text and doc.file_key:
        path = UPLOAD_DIR / doc.file_key
        if path.exists():
            bbox = locate_bbox(path, payload.quote_text, payload.page_no)

    ann = Annotation(
        user_id=1,
        doc_id=doc.id,
        chunk_key=chunk_key,
        kind=payload.kind,
        tag_label=payload.tag_label,
        text=payload.text,
        quote_text=payload.quote_text,
        page_no=payload.page_no or (bbox or {}).get("page"),
        bbox=bbox,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    if chunk_key:
        promote_chunk_tier(db, chunk_key)
        db.commit()
    try:
        from app.core.cache import invalidate_scope

        invalidate_scope(db, f"reading:doc:{doc.id}")
    except Exception:
        pass
    return ann


@router.get("/documents/{document_id}/annotations", response_model=list[AnnotationOut])
def list_annotations(document_id: int, db: Session = Depends(get_db)):
    _get_doc(db, document_id)
    return (
        db.query(Annotation)
        .filter(Annotation.doc_id == document_id)
        .order_by(Annotation.created_at.desc())
        .all()
    )


@router.delete("/annotations/{annotation_id}")
def delete_annotation(annotation_id: int, db: Session = Depends(get_db)):
    ann = db.get(Annotation, annotation_id)
    if not ann:
        raise HTTPException(404, "批注不存在")
    db.delete(ann)
    db.commit()
    return {"ok": True}


@router.post("/documents/{document_id}/explain")
def explain(document_id: int, payload: ExplainRequest, db: Session = Depends(get_db)):
    _get_doc(db, document_id)
    if not payload.term.strip():
        raise HTTPException(422, "term 不能为空")
    explanation = explain_concept(payload.term.strip(), payload.context)
    db.add(
        UserLog(
            event_type="concept_explain",
            detail={"doc_id": document_id, "term": payload.term[:100]},
        )
    )
    db.commit()
    return {"term": payload.term, "explanation": explanation}


@router.get("/reading/tag-labels")
def tag_labels():
    return {"labels": TAG_LABELS}


@router.post("/documents/{document_id}/chat")
def reading_chat(document_id: int, payload: dict, db: Session = Depends(get_db)):
    import numpy as np

    from app.core.llm import chat, embed
    from app.core.vectors import blob_to_vec
    from app.services.writing import build_system_prompt

    doc = _get_doc(db, document_id)
    message = str(payload.get("message", "")).strip()
    if not message:
        raise HTTPException(422, "message 不能为空")

    from app.core.cache import fingerprint, get_result, set_result

    chunk_count = db.query(Chunk).filter(Chunk.doc_id == document_id).count()
    scope = f"reading:doc:{document_id}"
    key_hash = fingerprint(message + "||" + f"{chunk_count}:{doc.updated_at}")
    cached = get_result(db, scope, key_hash)
    if cached:
        answer = dict(cached["answer"])
        answer["cached"] = True
        try:
            from app.models.user import UserLog

            db.add(
                UserLog(
                    event_type="cache_hit",
                    detail={"scope": scope, "cache_id": cached.get("cache_id")},
                )
            )
            db.commit()
        except Exception:
            pass
        return answer

    chunks = (
        db.query(Chunk)
        .filter(Chunk.doc_id == document_id, Chunk.embedding.isnot(None))
        .all()
    )
    retrieved = []
    if chunks:
        try:
            qvec = embed([message])[0]
            scored = []
            for c in chunks:
                v = blob_to_vec(c.embedding)
                n = np.linalg.norm(v)
                if n == 0:
                    continue
                scored.append((float(np.dot(qvec, v) / n), c))
            scored.sort(key=lambda x: -x[0])
            retrieved = [c for _, c in scored[:4]]
        except Exception:
            retrieved = chunks[:4]

    evidence_lines = []
    refs = []
    for i, c in enumerate(retrieved, 1):
        evidence_lines.append(f"[c{i}] （{c.section_title or '正文'}）\n{c.content[:900]}")
        refs.append(
            {
                "ref": f"c{i}",
                "chunk_key": c.chunk_key,
                "page_no": c.page_no,
                "section_title": c.section_title,
            }
        )

    history = payload.get("history", [])[-6:]
    system_prompt = build_system_prompt(db, 1)
    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                f"用户正在精读文献《{doc.title or doc.file_name}》。以下是与该文献相关的证据片段：\n"
                f"{chr(10).join(evidence_lines) or '（该文献暂无可用片段）'}\n\n"
                "请基于证据回答用户问题，引用时用 [c1] [c2] 等标记标注依据；"
                "证据不足时如实说明。回答简洁、聚焦，支持使用 Markdown 排版。\n"
            ),
        },
    ]
    messages.extend({"role": h.get("role", "user"), "content": h.get("content", "")} for h in history)
    messages.append({"role": "user", "content": message})
    reply = chat("STRONG", messages, temperature=0.4, metric_prefix=system_prompt)
    set_result(
        db,
        scope,
        key_hash,
        message,
        {"reply": reply, "refs": refs},
        provenance={"chunks": [c.chunk_key for c in retrieved], "route": "doc_scope"},
    )
    return {"reply": reply, "refs": refs, "cached": False}
