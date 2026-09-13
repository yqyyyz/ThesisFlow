import contextvars
import hashlib
import inspect
import json
import re
import time
import uuid
from collections.abc import Iterator
from typing import Any

import numpy as np
from openai import OpenAI

from app.config import settings
from app.database import SessionLocal
from app.models.user import UserLog

_chat_client: OpenAI | None = None
_embed_client: OpenAI | None = None
_evaluation_context: contextvars.ContextVar[dict[str, str | None]] = contextvars.ContextVar(
    "evaluation_context", default={}
)

_SECRET_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"),
    re.compile(
        r"(?i)\b(api[_ -]?key|authorization|bearer)\b\s*[:=]?\s*[^\s,;]+"
    ),
)


def set_evaluation_context(
    run_id: str | None,
    task_id: str | None,
    request_id: str | None = None,
):
    """为当前 API 请求关联测评运行与任务。"""
    return _evaluation_context.set(
        {
            "run_id": run_id,
            "task_id": task_id,
            "request_id": request_id or str(uuid.uuid4()),
        }
    )


def reset_evaluation_context(token) -> None:
    _evaluation_context.reset(token)


def _redact(value: Any) -> Any:
    if isinstance(value, str):
        result = value
        for pattern in _SECRET_PATTERNS:
            result = pattern.sub("[REDACTED]", result)
        return result
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _redact(item) for key, item in value.items()}
    return value


def _messages_sha256(messages: list[dict]) -> str:
    raw = json.dumps(messages, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _caller_id() -> str:
    for frame in inspect.stack()[2:]:
        module = frame.frame.f_globals.get("__name__", "")
        if module and module != __name__:
            return f"{module}.{frame.function}"
    return "unclassified"


def _prompt_detail(
    messages: list[dict],
    temperature: float,
    json_mode: bool,
    max_tokens: int | None,
    trace: dict | None,
    metric_prefix: str | None,
) -> dict:
    safe_messages = _redact(messages)
    trace = _redact(trace or {})
    context = _evaluation_context.get()
    caller_id = _caller_id()
    system_messages = [m.get("content", "") for m in safe_messages if m.get("role") == "system"]
    user_messages = [m.get("content", "") for m in safe_messages if m.get("role") == "user"]
    return {
        "prompt_call_id": str(uuid.uuid4()),
        "run_id": trace.get("run_id") or context.get("run_id"),
        "task_id": trace.get("task_id") or context.get("task_id"),
        "request_id": context.get("request_id"),
        "parent_call_id": trace.get("parent_call_id"),
        "stage": trace.get("stage", caller_id),
        "prompt_template_id": trace.get("prompt_template_id", caller_id),
        "prompt_template_version": trace.get("prompt_template_version", "1.0.0"),
        "prompt_template_source": trace.get("prompt_template_source"),
        "system_prompt_present": bool(system_messages),
        "system_prompt_rendered": "\n\n".join(system_messages) if system_messages else None,
        "raw_user_instruction": trace.get("raw_user_instruction"),
        "user_prompt_rendered": user_messages[-1] if user_messages else None,
        "messages": safe_messages,
        "context_manifest": trace.get("context_manifest", {}),
        "model_config": {
            "temperature": temperature,
            "json_mode": json_mode,
            "max_tokens": max_tokens,
            "thinking_enabled": settings.thinking_enabled,
        },
        "prompt_sha256": _messages_sha256(safe_messages),
        "prefix_hash": prefix_hash(metric_prefix),
    }


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
    trace: dict | None = None,
) -> str:
    detail = _prompt_detail(
        messages, temperature, json_mode, max_tokens, trace, metric_prefix
    )
    detail["model_config"].update(
        {"slot": slot, "provider": PROVIDERS[slot], "name": SLOTS[slot]}
    )
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
    try:
        client = _get_chat_client()
        resp = client.chat.completions.create(**kwargs)
        latency = int((time.time() - start) * 1000)
        usage = resp.usage
        output = resp.choices[0].message.content or ""
        detail.update(
            {
                "ttft_ms": latency,
                "raw_output": _redact(output),
                "parsed_output": _parse_json_output(output) if json_mode else None,
                "error": None,
            }
        )
        _log_llm_call(
            slot,
            SLOTS[slot],
            latency,
            usage.prompt_tokens if usage else None,
            usage.completion_tokens if usage else None,
            detail,
        )
        return output
    except Exception as exc:
        latency = int((time.time() - start) * 1000)
        detail.update({"raw_output": None, "parsed_output": None, "error": str(exc)[:500]})
        _log_llm_call(slot, SLOTS[slot], latency, None, None, detail)
        raise


def _parse_json_output(output: str) -> Any:
    try:
        return json.loads(output)
    except (json.JSONDecodeError, TypeError):
        return None


def chat_stream(
    slot: str,
    messages: list[dict],
    temperature: float = 0.3,
    metric_prefix: str | None = None,
    trace: dict | None = None,
) -> Iterator[str]:
    detail = _prompt_detail(messages, temperature, False, None, trace, metric_prefix)
    detail["model_config"].update(
        {"slot": slot, "provider": PROVIDERS[slot], "name": SLOTS[slot]}
    )
    start = time.time()
    ttft_ms: int | None = None
    total_len = 0
    output_parts: list[str] = []
    try:
        client = _get_chat_client()
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
                output_parts.append(delta)
                yield delta
        latency = int((time.time() - start) * 1000)
        detail.update(
            {
                "stream_chars": total_len,
                "ttft_ms": ttft_ms,
                "raw_output": _redact("".join(output_parts)),
                "parsed_output": None,
                "error": None,
            }
        )
        _log_llm_call(slot, SLOTS[slot], latency, None, None, detail)
    except Exception as exc:
        latency = int((time.time() - start) * 1000)
        detail.update(
            {
                "stream_chars": total_len,
                "ttft_ms": ttft_ms,
                "raw_output": _redact("".join(output_parts)),
                "parsed_output": None,
                "error": str(exc)[:500],
            }
        )
        _log_llm_call(slot, SLOTS[slot], latency, None, None, detail)
        raise


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
