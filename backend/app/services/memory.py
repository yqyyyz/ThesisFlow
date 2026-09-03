import json
import re
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.llm import chat, embed
from app.core.vectors import blob_to_vec, cosine_similarity, vec_to_blob
from app.models.user import DomainMemory
from app.prompts.templates import memory_extract_prompt

MERGE_THRESHOLD = 0.90
CONFLICT_LOW = 0.60


def extract_candidates(conversation: str) -> list[str]:
    raw = chat(
        "LIGHT",
        [{"role": "user", "content": memory_extract_prompt(conversation[-6000:])}],
        temperature=0.1,
        json_mode=True,
    )
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(m)[:300] for m in parsed if str(m).strip()]
        return []
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", raw, re.S)
        if m:
            try:
                parsed = json.loads(m.group(0))
                return [str(x)[:300] for x in parsed]
            except json.JSONDecodeError:
                return []
        return []


def integrate_memories(db: Session, candidates: list[str], source_ref: str) -> dict:
    stats = {"merged": 0, "conflicts": 0, "created": 0}
    existing = (
        db.query(DomainMemory)
        .filter(DomainMemory.user_id == 1, DomainMemory.status.in_(["active", "pending_review"]))
        .all()
    )
    if not candidates:
        return stats
    try:
        cand_vecs = embed(candidates)
    except Exception:
        cand_vecs = [None] * len(candidates)

    for cand, cvec in zip(candidates, cand_vecs):
        matched = None
        match_sim = 0.0
        if cvec is not None:
            for ex in existing:
                sim = None
                if hasattr(ex, "_vec_cache"):
                    sim = cosine_similarity(cvec, ex._vec_cache)
                if sim is None:
                    try:
                        ex_vec = embed([ex.content])[0]
                        ex._vec_cache = ex_vec
                        sim = cosine_similarity(cvec, ex_vec)
                    except Exception:
                        continue
                if sim > match_sim:
                    match_sim = sim
                    matched = ex

        if matched and match_sim >= MERGE_THRESHOLD:
            matched.trigger_count += 1
            matched.confidence = min(1.0, matched.confidence + 0.1)
            matched.last_triggered_at = datetime.now()
            stats["merged"] += 1
        elif matched and CONFLICT_LOW <= match_sim < MERGE_THRESHOLD and match_sim > 0:
            mem = DomainMemory(
                user_id=1,
                content=cand,
                type="implicit",
                confidence=0.5,
                last_triggered_at=datetime.now(),
                trigger_count=1,
                source_ref=source_ref,
                conflict_with=matched.id,
                status="pending_review",
            )
            db.add(mem)
            stats["conflicts"] += 1
        else:
            mem = DomainMemory(
                user_id=1,
                content=cand,
                type="implicit",
                confidence=0.5,
                last_triggered_at=datetime.now(),
                trigger_count=1,
                source_ref=source_ref,
            )
            db.add(mem)
            stats["created"] += 1
    db.commit()
    return stats


def generate_health_report(db: Session) -> dict:
    now = datetime.now()
    stale_cutoff = now - timedelta(days=180)
    weak_cutoff = now - timedelta(days=30)
    all_mems = (
        db.query(DomainMemory)
        .filter(DomainMemory.user_id == 1, DomainMemory.status == "active")
        .all()
    )
    flagged = []
    for m in all_mems:
        reasons = []
        if m.confidence < 0.35:
            reasons.append("置信度过低")
        if m.last_triggered_at and m.last_triggered_at < stale_cutoff:
            reasons.append("超过 180 天未触发")
        if (
            m.trigger_count <= 1
            and m.created_at
            and m.created_at < weak_cutoff
        ):
            reasons.append("创建超 30 天且低频引用")
        if reasons:
            flagged.append({"memory": m, "reasons": reasons})
    summary = (
        f"共扫描 {len(all_mems)} 条活跃记忆，"
        f"{len(flagged)} 条待确认（置信度低或长期未触发）。"
        if all_mems
        else "记忆库为空。"
    )
    return {"flagged": flagged, "summary": summary, "total": len(all_mems)}
