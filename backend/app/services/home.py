import hashlib
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.llm import chat
from app.models.drafting import Citation, DomainInsight, Draft
from app.models.literature import Annotation, Document, Project


def project_signature(db: Session, project: Project) -> str:
    doc_count = (
        db.query(func.count(Document.id))
        .filter(Document.project_id == project.id)
        .scalar()
        or 0
    )
    ann_count = (
        db.query(func.count(Annotation.id))
        .join(Document, Annotation.doc_id == Document.id)
        .filter(Document.project_id == project.id)
        .scalar()
        or 0
    )
    drafts = db.query(Draft).filter(Draft.project_id == project.id).all()
    words = sum(d.word_count or 0 for d in drafts)
    cite_count = (
        db.query(func.count(Citation.id))
        .join(Draft, Citation.draft_id == Draft.id)
        .filter(Draft.project_id == project.id)
        .scalar()
        or 0
    )
    raw = f"{doc_count}|{ann_count}|{words}|{cite_count}|{project.stage}|{project.updated_at}"
    return hashlib.md5(raw.encode()).hexdigest()


def _metrics(db: Session, project: Project) -> dict:
    docs = db.query(Document).filter(Document.project_id == project.id).all()
    ready = [d for d in docs if d.status == "ready"]
    scores = [
        sum(v["score"] for v in (d.scores or {}).values()) / max(len(d.scores or {}), 1)
        for d in ready
        if d.scores
    ]
    ann_count = (
        db.query(func.count(Annotation.id))
        .join(Document, Annotation.doc_id == Document.id)
        .filter(Document.project_id == project.id)
        .scalar()
        or 0
    )
    drafts = db.query(Draft).filter(Draft.project_id == project.id).all()
    words = sum(d.word_count or 0 for d in drafts)
    return {
        "doc_total": len(docs),
        "doc_ready": len(ready),
        "avg_score": round(sum(scores) / len(scores), 2) if scores else None,
        "annotations": ann_count,
        "draft_words": words,
    }


def generate_progress_summary(db: Session, project: Project) -> dict:
    sig = project_signature(db, project)
    cached = project.progress_summary or {}
    if cached.get("signature") == sig and cached.get("text"):
        return cached
    m = _metrics(db, project)
    stage_map = {"topic": "选题阶段", "literature": "文献整理阶段", "writing": "写作阶段"}
    prompt = (
        f"项目：《{project.name}》\n"
        f"研究问题：{project.research_question or '（未设定）'}\n"
        f"当前阶段：{stage_map.get(project.stage, project.stage)}\n"
        f"指标：文献 {m['doc_ready']}/{m['doc_total']} 篇就绪"
        f"{'，平均评分 ' + str(m['avg_score']) if m['avg_score'] else ''}"
        f"，精读批注 {m['annotations']} 条，草稿 {m['draft_words']} 字\n\n"
        "请用 2-3 句中文总结该项目的研究进展，并给出 1 条最关键的下一步建议。"
        "第一句概述当前进展，第二句指出薄弱环节，最后一句以『建议：』开头给出具体下一步。"
    )
    text = chat("LIGHT", [{"role": "user", "content": prompt}], temperature=0.4)
    result = {"signature": sig, "text": text.strip(), "metrics": m,
              "generated_at": datetime.now().isoformat()}
    project.progress_summary = result
    db.commit()
    return result


def gen_insight_for_doc(db: Session, doc: Document) -> DomainInsight | None:
    summary = (doc.summary_cache or "").replace("<!--PREREAD-->", "")[:600]
    prompt = (
        f"用户的领域知识库新增了一篇文献：《{doc.title or doc.file_name}》"
        f"{'（' + str(doc.venue) + '，' + str(doc.year) + '）' if doc.venue else ''}\n"
        f"该文献摘要/要点：{summary or '（暂无）'}\n\n"
        "请用不超过 80 字，提炼这篇文献为用户的研究领域带来的一条新知识或新视角，"
        "作为知识库的动态更新提示。直接输出提示文本，不要前缀。"
    )
    try:
        content = chat("LIGHT", [{"role": "user", "content": prompt}], temperature=0.5)
    except Exception:
        return None
    insight = DomainInsight(
        user_id=doc.user_id,
        type="kb_new_doc",
        title=f"新入库：{doc.title or doc.file_name or '领域文献'}",
        content=content.strip(),
        ref_doc_id=doc.id,
    )
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight


def list_insights(db: Session, limit: int = 10) -> list[DomainInsight]:
    return (
        db.query(DomainInsight)
        .filter(DomainInsight.user_id == 1)
        .order_by(DomainInsight.created_at.desc())
        .limit(limit)
        .all()
    )
