from fastapi import APIRouter, HTTPException

from app.services.demo import FIXTURE_PATH, restore_demo

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/demo-reset")
def demo_reset():
    if not FIXTURE_PATH.exists():
        raise HTTPException(404, "演示快照不存在，请先运行种子脚本")
    result = restore_demo()
    return {"ok": True, **result}


@router.get("/demo-status")
def demo_status():
    return {
        "fixture_exists": FIXTURE_PATH.exists(),
    }
