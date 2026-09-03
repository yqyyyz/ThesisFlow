from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.drafting import HealthReport
from app.models.user import DomainMemory
from app.services.memory import generate_health_report, integrate_memories

router = APIRouter(prefix="/api/memory", tags=["memory"])


def _invalidate_caches(db) -> None:
    try:
        from app.core.cache import invalidate_all_results

        invalidate_all_results(db)
    except Exception:
        pass


class MemoryCreate(BaseModel):
    content: str
    type: str = "explicit"


class MemoryUpdate(BaseModel):
    content: str | None = None
    status: str | None = None
    confidence: float | None = None
    conflict_resolution: str | None = None


def _mem_dict(m: DomainMemory) -> dict:
    return {
        "id": m.id,
        "content": m.content,
        "type": m.type,
        "confidence": m.confidence,
        "trigger_count": m.trigger_count,
        "last_triggered_at": m.last_triggered_at,
        "source_ref": m.source_ref,
        "conflict_with": m.conflict_with,
        "status": m.status,
        "created_at": m.created_at,
    }


@router.get("")
def list_memories(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(DomainMemory).filter(DomainMemory.user_id == 1)
    if status:
        q = q.filter(DomainMemory.status == status)
    mems = q.order_by(DomainMemory.confidence.desc(), DomainMemory.updated_at.desc()).all()
    return {"memories": [_mem_dict(m) for m in mems]}


@router.post("")
def create_memory(payload: MemoryCreate, db: Session = Depends(get_db)):
    if payload.type not in ("explicit", "implicit"):
        raise HTTPException(422, "type 必须为 explicit / implicit")
    stats = integrate_memories(db, [payload.content.strip()], source_ref="manual")
    _invalidate_caches(db)
    return {"ok": True, "stats": stats}


@router.patch("/{memory_id}")
def update_memory(memory_id: int, payload: MemoryUpdate, db: Session = Depends(get_db)):
    mem = db.get(DomainMemory, memory_id)
    if not mem:
        raise HTTPException(404, "记忆不存在")
    if payload.content is not None:
        mem.content = payload.content
    if payload.confidence is not None:
        mem.confidence = max(0.0, min(1.0, payload.confidence))
    if payload.conflict_resolution == "keep_new":
        if mem.conflict_with:
            old = db.get(DomainMemory, mem.conflict_with)
            if old:
                old.status = "archived"
        mem.status = "active"
        mem.conflict_with = None
    elif payload.conflict_resolution == "keep_old":
        mem.status = "archived"
        mem.conflict_with = None
    elif payload.conflict_resolution == "merge":
        if mem.conflict_with:
            old = db.get(DomainMemory, mem.conflict_with)
            if old:
                old.content = f"{old.content}；{mem.content}"
                old.confidence = min(1.0, old.confidence + 0.1)
        mem.status = "archived"
        mem.conflict_with = None
    elif payload.status:
        mem.status = payload.status
    db.commit()
    db.refresh(mem)
    _invalidate_caches(db)
    return _mem_dict(mem)


@router.delete("/{memory_id}")
def delete_memory(memory_id: int, db: Session = Depends(get_db)):
    mem = db.get(DomainMemory, memory_id)
    if not mem:
        raise HTTPException(404, "记忆不存在")
    db.delete(mem)
    db.commit()
    _invalidate_caches(db)
    return {"ok": True}


@router.get("/health-report")
def health_report(db: Session = Depends(get_db)):
    result = generate_health_report(db)
    report = HealthReport(
        user_id=1,
        flagged_memory_ids=[f["memory"].id for f in result["flagged"]],
        summary=result["summary"],
    )
    db.add(report)
    for f in result["flagged"]:
        f["memory"].status = "pending_review"
    db.commit()
    return {
        "summary": result["summary"],
        "total": result["total"],
        "flagged": [
            {
                "memory": _mem_dict(f["memory"]),
                "reasons": f["reasons"],
            }
            for f in result["flagged"]
        ],
    }
