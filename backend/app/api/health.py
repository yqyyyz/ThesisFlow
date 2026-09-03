from fastapi import APIRouter

from app.config import settings
from app.core.llm import PROVIDERS, SLOTS

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "chat_configured": bool(settings.deepseek_api_key),
        "embed_configured": bool(settings.dashscope_api_key),
        "models": SLOTS,
        "providers": PROVIDERS,
        "thinking_enabled": settings.thinking_enabled,
    }
