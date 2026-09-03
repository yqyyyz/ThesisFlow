from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.literature import Document, Project
from app.services.home import generate_progress_summary, gen_insight_for_doc, list_insights

router = APIRouter(prefix="/api/home", tags=["home"])


@router.get("/insights")
def get_insights(db: Session = Depends(get_db)):
    insights = list_insights(db)
    return {
        "insights": [
            {
                "id": i.id,
                "type": i.type,
                "title": i.title,
                "content": i.content,
                "ref_doc_id": i.ref_doc_id,
                "created_at": i.created_at,
            }
            for i in insights
        ]
    }


@router.post("/insights:refresh")
def refresh_insights(db: Session = Depends(get_db)):
    latest = (
        db.query(Document)
        .filter(Document.project_id.is_(None), Document.status == "ready")
        .order_by(Document.created_at.desc())
        .limit(3)
        .all()
    )
    if not latest:
        return {"created": 0, "message": "领域知识库暂无就绪文献，先上传资料再挖掘"}
    created = 0
    for doc in latest:
        if gen_insight_for_doc(db, doc):
            created += 1
    return {"created": created}


@router.get("/project-summaries")
def project_summaries(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.updated_at.desc()).all()
    result = []
    for p in projects:
        summary = generate_progress_summary(db, p)
        result.append(
            {
                "project_id": p.id,
                "name": p.name,
                "stage": p.stage,
                "research_question": p.research_question,
                "text": summary.get("text", ""),
                "metrics": summary.get("metrics", {}),
            }
        )
    return {"projects": result}
