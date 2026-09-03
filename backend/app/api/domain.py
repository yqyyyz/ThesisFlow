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
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR
from app.database import get_db
from app.models.drafting import DomainLandscape
from app.models.literature import Document
from app.models.user import User
from app.services.ingestion import run_pipeline
from app.services.landscape import generate_landscape, generate_landscape_graph

router = APIRouter(prefix="/api/domain", tags=["domain"])


@router.post("/documents")
async def upload_kb_document(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    accepted = []
    for f in files:
        fname = (f.filename or "").lower()
        if not fname.endswith((".pdf", ".docx", ".md")):
            continue
        uid = uuid.uuid4().hex[:12]
        safe_name = Path(f.filename).name
        file_key = f"kb/{uid}_{safe_name}"
        dest = UPLOAD_DIR / file_key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(await f.read())
        doc = Document(
            user_id=1,
            project_id=None,
            file_key=file_key,
            file_name=safe_name,
            status="uploaded",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        accepted.append({"id": doc.id, "file_name": safe_name})
        background_tasks.add_task(run_pipeline, doc.id)
    return {"accepted": accepted}


@router.get("/documents")
def list_kb_documents(db: Session = Depends(get_db)):
    docs = (
        db.query(Document)
        .filter(Document.project_id.is_(None))
        .order_by(Document.created_at.desc())
        .all()
    )
    return {
        "documents": [
            {
                "id": d.id,
                "title": d.title,
                "file_name": d.file_name,
                "venue": d.venue,
                "year": d.year,
                "status": d.status,
                "error_msg": d.error_msg,
                "created_at": d.created_at,
            }
            for d in docs
        ]
    }


@router.post("/landscape:generate")
def gen_landscape(db: Session = Depends(get_db)):
    user = db.get(User, 1)
    try:
        report, source_ids = generate_landscape(db)
        graph, _ = generate_landscape_graph(db)
    except Exception as e:
        raise HTTPException(500, f"图景生成失败：{e}") from e
    row = DomainLandscape(
        user_id=1,
        domain=user.sub_discipline or user.discipline if user else None,
        content=report,
        graph_json=graph,
        source_doc_ids=source_ids,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "domain": row.domain,
        "content": row.content,
        "graph": row.graph_json,
        "created_at": row.created_at,
    }


@router.get("/landscapes")
def list_landscapes(db: Session = Depends(get_db)):
    rows = (
        db.query(DomainLandscape)
        .filter(DomainLandscape.user_id == 1)
        .order_by(DomainLandscape.created_at.desc())
        .limit(10)
        .all()
    )
    return {
        "landscapes": [
            {
                "id": r.id,
                "domain": r.domain,
                "content": r.content,
                "graph": r.graph_json,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }
