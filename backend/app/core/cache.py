import hashlib
import re
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.caching import ContextCache, ResultCache

RESULT_TTL_HOURS = 12
CONTEXT_TTL_DAYS = 3


def fingerprint(text: str) -> str:
    norm = re.sub(r"\s+", " ", text.strip().lower())
    return hashlib.md5(norm.encode("utf-8")).hexdigest()


def get_result(db: Session, scope: str, key_hash: str) -> dict | None:
    row = (
        db.query(ResultCache)
        .filter(
            ResultCache.scope == scope,
            ResultCache.key_hash == key_hash,
            ResultCache.expires_at > datetime.now(),
        )
        .order_by(ResultCache.id.desc())
        .first()
    )
    if row is None:
        return None
    return {"answer": row.answer, "provenance": row.provenance, "cache_id": row.id}


def set_result(
    db: Session,
    scope: str,
    key_hash: str,
    query: str,
    answer: dict,
    provenance: dict | None = None,
    ttl_hours: float = RESULT_TTL_HOURS,
) -> None:
    db.add(
        ResultCache(
            scope=scope,
            key_hash=key_hash,
            query=query[:2000],
            answer=answer,
            provenance=provenance,
            expires_at=datetime.now() + timedelta(hours=ttl_hours),
        )
    )
    db.commit()


def get_context(db: Session, scope: str, kind: str) -> dict | None:
    row = (
        db.query(ContextCache)
        .filter(
            ContextCache.scope == scope,
            ContextCache.kind == kind,
            ContextCache.expires_at > datetime.now(),
        )
        .order_by(ContextCache.id.desc())
        .first()
    )
    return row.content if row else None


def set_context(
    db: Session,
    scope: str,
    kind: str,
    content: dict,
    ttl_days: float = CONTEXT_TTL_DAYS,
) -> None:
    old = (
        db.query(ContextCache)
        .filter(ContextCache.scope == scope, ContextCache.kind == kind)
        .all()
    )
    for row in old:
        db.delete(row)
    db.add(
        ContextCache(
            scope=scope,
            key_hash=fingerprint(str(content)[:500]),
            kind=kind,
            content=content,
            expires_at=datetime.now() + timedelta(days=ttl_days),
        )
    )
    db.commit()


def invalidate_scope(db: Session, scope_prefix: str) -> int:
    n1 = (
        db.query(ResultCache)
        .filter(ResultCache.scope.like(scope_prefix + "%"))
        .delete(synchronize_session=False)
    )
    n2 = (
        db.query(ContextCache)
        .filter(ContextCache.scope.like(scope_prefix + "%"))
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(n1 or 0) + int(n2 or 0)


def invalidate_all_results(db: Session) -> int:
    n = db.query(ResultCache).delete(synchronize_session=False)
    db.commit()
    return int(n or 0)
