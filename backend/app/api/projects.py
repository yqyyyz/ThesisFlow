from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.literature import Annotation, Chunk, Document, Project
from app.schemas.literature import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _project_out(db: Session, p: Project) -> ProjectOut:
    count = (
        db.query(func.count(Document.id))
        .filter(Document.project_id == p.id)
        .scalar()
        or 0
    )
    out = ProjectOut.model_validate(p)
    out.doc_count = count
    return out


@router.post("", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(
        user_id=1,
        name=payload.name,
        description=payload.description,
        research_question=payload.research_question,
        stage="topic",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_out(db, project)


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_project_out(db, p) for p in projects]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    return _project_out(db, project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _project_out(db, project)


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    doc_ids = [d.id for d in docs]
    if doc_ids:
        placeholders = ",".join(str(int(i)) for i in doc_ids)
        db.query(Chunk).filter(Chunk.doc_id.in_(doc_ids)).delete(
            synchronize_session=False
        )
        db.query(Annotation).filter(Annotation.doc_id.in_(doc_ids)).delete(
            synchronize_session=False
        )
        db.execute(text(f"DELETE FROM chunks_fts WHERE doc_id IN ({placeholders})"))
    for d in docs:
        db.delete(d)
    db.delete(project)
    db.commit()
    return {"ok": True}
