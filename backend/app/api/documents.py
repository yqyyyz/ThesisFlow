import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR
from app.database import get_db
from app.models.literature import Chunk, Document, Project, ScoreFeedback
from app.schemas.literature import (
    BatchImportResult,
    DocumentOut,
    WeightUpdate,
)
from app.services.docmap import read_doc_map, regenerate_doc_map
from app.services.ingestion import run_pipeline
from app.services.scoring import (
    BUILTIN_DIMENSIONS,
    all_dimensions,
    dimension_weights,
    load_calibration_samples,
    score_document,
    weighted_total,
)

router = APIRouter(prefix="/api", tags=["documents"])


def _get_project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    return project


def _project_weights(project: Project) -> dict[str, float] | None:
    return dimension_weights(project)


def _doc_out(db: Session, doc: Document, weights: dict | None = None) -> DocumentOut:
    out = DocumentOut.model_validate(doc)
    if doc.scores:
        out.weighted_score = weighted_total(doc.scores, weights)
    return out


@router.post("/projects/{project_id}/documents:batch-import", response_model=BatchImportResult)
async def batch_import(
    project_id: int,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    project = _get_project(db, project_id)
    accepted: list[DocumentOut] = []
    weights = _project_weights(project)

    for f in files:
        fname = (f.filename or "").lower()
        if not fname.endswith((".pdf", ".docx", ".md")):
            continue
        uid = uuid.uuid4().hex[:12]
        safe_name = Path(f.filename).name
        file_key = f"{project_id}/{uid}_{safe_name}"
        dest = UPLOAD_DIR / file_key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(await f.read())

        doc = Document(
            user_id=1,
            project_id=project_id,
            file_key=file_key,
            file_name=safe_name,
            status="uploaded",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        accepted.append(_doc_out(db, doc, weights))
        background_tasks.add_task(run_pipeline, doc.id)

    return BatchImportResult(accepted=accepted, task_ids=[d.id for d in accepted])


@router.get("/projects/{project_id}/documents")
def list_documents(
    project_id: int,
    view: str = "list",
    sort: str = "weighted",
    db: Session = Depends(get_db),
):
    project = _get_project(db, project_id)
    weights = _project_weights(project)
    docs = (
        db.query(Document)
        .filter(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
        .all()
    )
    outs = [_doc_out(db, d, weights) for d in docs]
    fold_threshold = 2.5
    if sort == "weighted":
        outs.sort(key=lambda o: (o.weighted_score is None, -(o.weighted_score or 0)))
    elif sort in ("quality", "relevance", "methodology", "novelty"):
        outs.sort(
            key=lambda o: -(
                (o.scores or {}).get(sort, {}).get("score", 0) if o.scores else 0
            )
        )
    result = []
    for o in outs:
        folded = o.weighted_score is not None and o.weighted_score < fold_threshold
        result.append(o.model_dump() | {"folded": folded})
    return {"view": view, "documents": result}


@router.get("/documents/{document_id}")
def get_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "文献不存在")
    project = db.get(Project, doc.project_id) if doc.project_id else None
    out = _doc_out(db, doc, _project_weights(project) if project else None)
    chunk_count = db.query(Chunk).filter(Chunk.doc_id == doc.id).count()
    return out.model_dump() | {"chunk_count": chunk_count}


@router.get("/documents/{document_id}/file")
def get_document_file(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc or not doc.file_key:
        raise HTTPException(404, "文件不存在")
    path = UPLOAD_DIR / doc.file_key
    if not path.exists():
        raise HTTPException(404, "文件已丢失")
    return FileResponse(path, media_type="application/pdf", filename=doc.file_name)


@router.get("/documents/{document_id}/content")
def get_document_content(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "文献不存在")
    return {
        "kind": doc.kind or "pdf",
        "title": doc.title,
        "sections": doc.content_struct or [],
    }


@router.patch("/documents/{document_id}")
def update_document(document_id: int, payload: dict, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "文献不存在")
    title = payload.get("title")
    if title is not None:
        title = str(title).strip()
        if not (2 <= len(title) <= 300):
            raise HTTPException(422, "标题长度需在 2-300 字符之间")
        doc.title = title
    db.commit()
    return {"ok": True, "title": doc.title}


@router.post("/projects/{project_id}/retile")
def retile_documents(project_id: int, db: Session = Depends(get_db)):
    from app.services.parsing import parse_pdf

    _get_project(db, project_id)
    docs = (
        db.query(Document)
        .filter(Document.project_id == project_id, Document.status == "ready")
        .all()
    )
    updated = []
    for doc in docs:
        if not doc.file_key:
            continue
        path = UPLOAD_DIR / doc.file_key
        if not path.exists():
            continue
        try:
            result = parse_pdf(path)
        except Exception:
            continue
        if result.title_confidence == "high" and result.title_guess:
            if result.title_guess != doc.title:
                updated.append(
                    {"id": doc.id, "old": doc.title, "new": result.title_guess}
                )
                doc.title = result.title_guess
    db.commit()
    return {"updated": updated, "count": len(updated)}


@router.put("/projects/{project_id}/score-weights")
def update_weights(
    project_id: int, payload: WeightUpdate, db: Session = Depends(get_db)
):
    project = _get_project(db, project_id)
    valid_keys = {d["key"] for d in all_dimensions(project)}
    for dim, val in payload.weights.items():
        if dim not in valid_keys or not (0 <= val <= 1):
            raise HTTPException(422, f"非法权重: {dim}={val}")
    profile = dict(project.discipline_profile or {})
    profile["score_weights"] = payload.weights
    project.discipline_profile = profile
    db.commit()
    return {"ok": True, "weights": payload.weights}


@router.get("/projects/{project_id}/score-dimensions")
def get_dimensions(project_id: int, db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    weights = dimension_weights(project)
    profile = project.discipline_profile or {}
    return {
        "builtin": [
            {**d, "weight": weights.get(d["key"], 0.25)} for d in BUILTIN_DIMENSIONS
        ],
        "custom": profile.get("custom_dims", []),
    }


@router.put("/projects/{project_id}/score-dimensions")
def update_dimensions(project_id: int, payload: dict, db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    dims = payload.get("custom_dims", [])
    if len(dims) > 4:
        raise HTTPException(422, "自定义维度最多 4 个")
    cleaned = []
    for i, d in enumerate(dims):
        name = str(d.get("name", "")).strip()
        if not name:
            continue
        cleaned.append(
            {
                "key": f"custom_{i + 1}",
                "name": name[:20],
                "desc": str(d.get("desc", "用户自定义维度"))[:100],
                "weight": float(d.get("weight", 0.25)),
            }
        )
    profile = dict(project.discipline_profile or {})
    profile["custom_dims"] = cleaned
    project.discipline_profile = profile
    db.commit()
    return {"ok": True, "custom_dims": cleaned}


@router.post("/documents/{document_id}:rescore")
def rescore_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "文献不存在")
    if doc.status not in ("ready", "scoring"):
        raise HTTPException(422, "文献尚未完成入库，无法评分")
    project = db.get(Project, doc.project_id) if doc.project_id else None
    chunks = db.query(Chunk).filter(Chunk.doc_id == doc.id).all()
    abstract = next((c.content for c in chunks if c.typed_label == "abstract"), "")
    conclusion = next((c.content for c in chunks if c.typed_label == "conclusion"), "")
    meta_parts = []
    if doc.title:
        meta_parts.append(f"标题：{doc.title}")
    if doc.venue:
        meta_parts.append(f"发表：{doc.venue}")
    if doc.year:
        meta_parts.append(f"年份：{doc.year}")
    if doc.cited_by is not None:
        meta_parts.append(f"被引量：{doc.cited_by}")
    rq = project.research_question if project else ""
    doc.scores = score_document(
        "\n".join(meta_parts),
        abstract,
        conclusion[:2000],
        rq,
        all_dimensions(project),
        calibration=load_calibration_samples(db, doc.user_id),
    )
    db.commit()
    return {"ok": True, "scores": doc.scores}


@router.get("/documents/{document_id}/chunks/{chunk_key}/locate")
def locate_chunk(document_id: int, chunk_key: str, db: Session = Depends(get_db)):
    """引文溯源：按 chunk_key 返回片段页码，供精读页跳转定位。"""
    chunk = (
        db.query(Chunk)
        .filter(Chunk.chunk_key == chunk_key, Chunk.doc_id == document_id)
        .first()
    )
    if not chunk:
        raise HTTPException(404, "片段不存在")
    return {
        "chunk_key": chunk.chunk_key,
        "page_no": chunk.page_no,
        "section_title": chunk.section_title,
    }


@router.put("/documents/{document_id}/scores")
def update_scores(document_id: int, payload: dict, db: Session = Depends(get_db)):
    """人工校正四维评分：覆写分数与理由，并记录校正历史用于后续打分校准。"""
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "文献不存在")
    if doc.status not in ("ready", "scoring"):
        raise HTTPException(422, "文献尚未完成入库，无法评分")
    project = db.get(Project, doc.project_id) if doc.project_id else None
    valid_keys = {d["key"] for d in all_dimensions(project)}
    new_scores = payload.get("scores") or {}
    reasons = payload.get("reasons") or {}
    if not new_scores:
        raise HTTPException(422, "未提供任何分数变更")

    scores = dict(doc.scores or {})
    saved = []
    for dim, raw_score in new_scores.items():
        if dim not in valid_keys:
            raise HTTPException(422, f"非法维度: {dim}")
        try:
            score = int(raw_score)
        except (TypeError, ValueError):
            raise HTTPException(422, f"分数必须为整数: {dim}")
        if not 1 <= score <= 5:
            raise HTTPException(422, f"分数必须在 1-5 之间: {dim}")
        old = scores.get(dim) or {}
        model_score = old.get("score") if old else None
        scores[dim] = {
            "score": score,
            "reason": str(reasons.get(dim, old.get("reason", ""))).strip()[:200],
            "user_edited": True,
        }
        db.add(
            ScoreFeedback(
                user_id=doc.user_id,
                project_id=doc.project_id,
                doc_id=doc.id,
                dim=dim,
                model_score=model_score,
                user_score=score,
                reason=str(reasons.get(dim, "")).strip()[:300],
            )
        )
        saved.append(dim)
    doc.scores = scores
    db.commit()
    weights = _project_weights(project)
    return {
        "ok": True,
        "scores": doc.scores,
        "weighted_score": weighted_total(doc.scores, weights),
        "updated_dims": saved,
    }


@router.get("/projects/{project_id}/documents/docmap")
def documents_docmap(project_id: int, db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    result = read_doc_map(db, project)
    from app.models.caching import GraphEdge

    stored_edges = (
        db.query(GraphEdge).filter(GraphEdge.project_id == project_id).all()
    )
    if stored_edges and isinstance(result.get("map"), dict):
        merged = list(result["map"].get("edges", []))
        seen = {(e.get("source"), e.get("target")) for e in merged}
        for e in stored_edges:
            pair = (e.source_doc, e.target_doc)
            if pair in seen or (e.target_doc, e.source_doc) in seen:
                continue
            merged.append(
                {
                    "source": e.source_doc,
                    "target": e.target_doc,
                    "relation": e.relation,
                    "label": e.label or "",
                    "provenance": "deep_extract",
                }
            )
            seen.add(pair)
        result["map"] = dict(result["map"])
        result["map"]["edges"] = merged
    return result


@router.post("/projects/{project_id}/documents/docmap:deep-extract")
def documents_deep_extract(project_id: int, payload: dict, db: Session = Depends(get_db)):
    from app.services.docmap import deep_extract_edges

    project = _get_project(db, project_id)
    query = str(payload.get("query", "") or project.research_question or "")
    if not query:
        raise HTTPException(422, "请提供查询关键词")
    result = deep_extract_edges(db, project, query)
    from app.core.cache import invalidate_scope

    invalidate_scope(db, f"project:{project_id}")
    return result


@router.post("/projects/{project_id}/documents/docmap:regenerate")
def documents_docmap_regenerate(project_id: int, db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    graph = regenerate_doc_map(db, project)
    return graph


@router.post("/projects/{project_id}/rechunk")
def rechunk_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    from sqlalchemy import text as _text

    _get_project(db, project_id)
    docs = (
        db.query(Document)
        .filter(Document.project_id == project_id, Document.status == "ready")
        .all()
    )
    queued = []
    for doc in docs:
        if not doc.file_key:
            continue
        path = UPLOAD_DIR / doc.file_key
        if not path.exists():
            continue
        db.query(Chunk).filter(Chunk.doc_id == doc.id).delete(
            synchronize_session=False
        )
        db.execute(_text("DELETE FROM chunks_fts WHERE doc_id = :d"), {"d": str(doc.id)})
        doc.status = "uploaded"
        doc.content_struct = doc.content_struct
        queued.append(doc.id)
        background_tasks.add_task(run_pipeline, doc.id)
    db.commit()
    return {"queued": queued, "count": len(queued)}


@router.get("/projects/{project_id}/documents/graph")
def documents_graph(project_id: int, db: Session = Depends(get_db)):
    import numpy as np

    from app.core.vectors import blob_to_vec

    project = _get_project(db, project_id)
    docs = (
        db.query(Document)
        .filter(Document.project_id == project_id, Document.status == "ready")
        .all()
    )
    doc_vecs: dict[int, np.ndarray] = {}
    for d in docs:
        chunks = (
            db.query(Chunk.embedding)
            .filter(Chunk.doc_id == d.id, Chunk.embedding.isnot(None))
            .all()
        )
        if not chunks:
            continue
        mat = np.vstack([blob_to_vec(c[0]) for c in chunks])
        vec = mat.mean(axis=0)
        norm = np.linalg.norm(vec)
        if norm > 0:
            doc_vecs[d.id] = vec / norm

    nodes = []
    for d in docs:
        nodes.append(
            {
                "id": d.id,
                "title": d.title or d.file_name or f"文档 {d.id}",
                "venue": d.venue,
                "year": d.year,
                "weighted_score": weighted_total(d.scores, dimension_weights(project))
                if d.scores
                else None,
                "in_graph": d.id in doc_vecs,
            }
        )
    edges = []
    ids = list(doc_vecs.keys())
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            sim = float(np.dot(doc_vecs[ids[i]], doc_vecs[ids[j]]))
            if sim >= 0.45:
                edges.append(
                    {
                        "source": ids[i],
                        "target": ids[j],
                        "weight": round(sim, 3),
                    }
                )
    return {"nodes": nodes, "edges": edges}
