import json
from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.caching import ResultCache
from app.models.drafting import Citation
from app.models.user import UserLog

router = APIRouter(prefix="/api/observability", tags=["observability"])


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    logs = db.query(UserLog).order_by(UserLog.id.desc()).limit(2000).all()

    llm_calls = [l for l in logs if l.event_type == "llm_call"]
    strong_calls = [l for l in llm_calls if l.slot == "STRONG"]
    light_calls = [l for l in llm_calls if l.slot == "LIGHT"]

    def _detail(l) -> dict:
        d = l.detail
        if isinstance(d, str):
            try:
                d = json.loads(d)
            except json.JSONDecodeError:
                d = {}
        return d or {}

    ttft_values = [_detail(l).get("ttft_ms") for l in strong_calls]
    ttft_values = [v for v in ttft_values if isinstance(v, (int, float))]
    avg_ttft = round(sum(ttft_values) / len(ttft_values)) if ttft_values else None

    prefix_hashes = [_detail(l).get("prefix_hash") for l in llm_calls]
    prefix_hashes = [h for h in prefix_hashes if h]
    prefix_counter = Counter(prefix_hashes)
    repeat_hits = sum(c for _, c in prefix_counter.items() if c > 1)
    prefix_reuse_rate = round(repeat_hits / len(prefix_hashes), 3) if prefix_hashes else 0.0

    routes = db.query(UserLog).filter(UserLog.event_type == "route_decision").all()
    route_counter = Counter()
    intent_counter = Counter()
    intent_source_counter = Counter()
    for r in routes:
        d = _detail(r)
        route_counter[d.get("route", "?")] += 1
        intent_counter[d.get("intent", "?")] += 1
        intent_source_counter[d.get("intent_source", "?")] += 1

    cache_hits = (
        db.query(UserLog).filter(UserLog.event_type == "cache_hit").count()
    )
    result_cache_rows = db.query(ResultCache).count()

    citations = db.query(Citation).all()
    status_counter = Counter(c.status for c in citations)
    method_counter = Counter(c.verify_method or "vector" for c in citations)
    nli_counter = Counter(c.nli_verdict for c in citations if c.nli_verdict)

    tokens_prompt = sum(l.prompt_tokens or 0 for l in llm_calls)
    tokens_completion = sum(l.completion_tokens or 0 for l in llm_calls)

    return {
        "llm_calls": {
            "total": len(llm_calls),
            "strong": len(strong_calls),
            "light": len(light_calls),
            "strong_ratio": round(len(strong_calls) / len(llm_calls), 3) if llm_calls else 0,
            "avg_ttft_ms": avg_ttft,
            "prefix_reuse_rate": prefix_reuse_rate,
            "top_prefixes": prefix_counter.most_common(5),
            "tokens_prompt": tokens_prompt,
            "tokens_completion": tokens_completion,
        },
        "routing": {
            "decisions": len(routes),
            "by_route": dict(route_counter),
            "by_intent": dict(intent_counter),
            "by_source": dict(intent_source_counter),
        },
        "cache": {
            "hits": cache_hits,
            "result_cache_rows": result_cache_rows,
        },
        "citations": {
            "total": len(citations),
            "by_status": dict(status_counter),
            "by_method": dict(method_counter),
            "nli_verdicts": dict(nli_counter),
            "hallucination_rate": round(
                status_counter.get("invalid", 0) / len(citations), 3
            )
            if citations
            else 0.0,
        },
    }
