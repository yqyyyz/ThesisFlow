import hashlib
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
from openai import OpenAI

from app.config import settings
from app.database import SessionLocal
from app.models.user import UserLog

_chat_client: OpenAI | None = None
_embed_client: OpenAI | None = None


def _get_chat_client() -> OpenAI:
    global _chat_client
    if _chat_client is None:
        if not settings.deepseek_api_key:
            raise RuntimeError(
                "DEEPSEEK_API_KEY 未配置：请在 backend/.env 中填入 DeepSeek 平台 Key"
            )
        _chat_client = OpenAI(
            base_url=settings.deepseek_base_url,
            api_key=settings.deepseek_api_key,
            timeout=settings.llm_timeout,
        )
    return _chat_client


def _get_embed_client() -> OpenAI:
    global _embed_client
    if _embed_client is None:
        if not settings.dashscope_api_key:
            raise RuntimeError(
                "DASHSCOPE_API_KEY 未配置：请在 backend/.env 中填入百炼按量付费 sk- Key（用于向量化）"
            )
        _embed_client = OpenAI(
            base_url=settings.bailian_base_url,
            api_key=settings.dashscope_api_key,
            timeout=settings.llm_timeout,
        )
    return _embed_client


SLOTS: dict[str, str] = {
    "STRONG": settings.model_strong,
    "LIGHT": settings.model_light,
    "EMBED": settings.model_embed,
    "RERANK": settings.model_rerank,
}

PROVIDERS: dict[str, str] = {
    "STRONG": "deepseek",
    "LIGHT": "deepseek",
    "EMBED": "bailian",
    "RERANK": "bailian",
}


def approx_tokens(text: str) -> int:
    return max(1, int(len(text) / 1.6))


def prefix_hash(prefix: str | None) -> str | None:
    if not prefix:
        return None
    return hashlib.md5(prefix.encode("utf-8")).hexdigest()[:12]


def _log_llm_call(
    slot: str,
    model: str,
    latency_ms: int,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    detail: dict | None = None,
) -> None:
    try:
        with SessionLocal() as db:
            db.add(
                UserLog(
                    event_type="llm_call",
                    slot=slot,
                    model=model,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    latency_ms=latency_ms,
                    detail=detail,
                )
            )
            db.commit()
    except Exception:
        pass


def _thinking_body() -> dict:
    if settings.thinking_enabled:
        return {}
    return {"thinking": {"type": "disabled"}}


def chat(
    slot: str,
    messages: list[dict],
    temperature: float = 0.3,
    json_mode: bool = False,
    max_tokens: int | None = None,
    metric_prefix: str | None = None,
) -> str:
    client = _get_chat_client()
    kwargs: dict[str, Any] = {
        "model": SLOTS[slot],
        "messages": messages,
        "temperature": temperature,
        "extra_body": _thinking_body(),
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    start = time.time()
    resp = client.chat.completions.create(**kwargs)
    latency = int((time.time() - start) * 1000)
    usage = resp.usage
    _log_llm_call(
        slot,
        SLOTS[slot],
        latency,
        usage.prompt_tokens if usage else None,
        usage.completion_tokens if usage else None,
        {"ttft_ms": latency, "prefix_hash": prefix_hash(metric_prefix)},
    )
    return resp.choices[0].message.content or ""


def chat_stream(
    slot: str,
    messages: list[dict],
    temperature: float = 0.3,
    metric_prefix: str | None = None,
) -> Iterator[str]:
    client = _get_chat_client()
    start = time.time()
    ttft_ms: int | None = None
    total_len = 0
    stream = client.chat.completions.create(
        model=SLOTS[slot],
        messages=messages,
        temperature=temperature,
        stream=True,
        extra_body=_thinking_body(),
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            if ttft_ms is None:
                ttft_ms = int((time.time() - start) * 1000)
            total_len += len(delta)
            yield delta
    latency = int((time.time() - start) * 1000)
    _log_llm_call(
        slot,
        SLOTS[slot],
        latency,
        None,
        None,
        {
            "stream_chars": total_len,
            "ttft_ms": ttft_ms,
            "prefix_hash": prefix_hash(metric_prefix),
        },
    )


def embed(texts: list[str]) -> list[np.ndarray]:
    client = _get_embed_client()
    start = time.time()
    resp = client.embeddings.create(
        model=SLOTS["EMBED"],
        input=texts,
        dimensions=settings.embed_dim,
    )
    latency = int((time.time() - start) * 1000)
    usage = resp.usage
    _log_llm_call(
        "EMBED",
        SLOTS["EMBED"],
        latency,
        getattr(usage, "prompt_tokens", None),
        None,
        {"count": len(texts)},
    )
    sorted_data = sorted(resp.data, key=lambda d: d.index)
    return [np.asarray(d.embedding, dtype=np.float32) for d in sorted_data]


def rerank(query: str, documents: list[str], top_n: int | None = None) -> list[dict] | None:
    if not settings.rerank_enabled:
        return None
    try:
        import dashscope

        dashscope.api_key = settings.dashscope_api_key
        start = time.time()
        resp = dashscope.TextReRank.call(
            model=SLOTS["RERANK"],
            query=query,
            documents=documents,
            top_n=top_n or len(documents),
            return_documents=False,
        )
        latency = int((time.time() - start) * 1000)
        if resp.status_code != 200:
            return None
        _log_llm_call("RERANK", SLOTS["RERANK"], latency, None, None,
                      {"count": len(documents)})
        return [
            {"index": r.index, "score": r.relevance_score} for r in resp.output.results
        ]
    except Exception as e:
        _log_llm_call("RERANK", SLOTS["RERANK"], 0, None, None, {"error": str(e)})
        return None
