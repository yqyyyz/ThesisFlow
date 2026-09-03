import base64
import json
import shutil
from datetime import datetime
from pathlib import Path

from sqlalchemy import DateTime, inspect
from sqlalchemy.orm import Session

from app.config import DATA_DIR
from app.database import SessionLocal
from app.models import (
    AiFeedback,
    Annotation,
    ChatMessage,
    ChatSession,
    Chunk,
    ChunkEntity,
    Citation,
    ComparisonMatrix,
    ContextCache,
    Document,
    DocumentMap,
    DomainLandscape,
    DomainMemory,
    Draft,
    DraftSnapshot,
    GraphEdge,
    HealthReport,
    Project,
    ResultCache,
    ScoreFeedback,
    User,
    UserLog,
)

FIXTURE_PATH = DATA_DIR / "demo_fixture.json"
UPLOADS_SNAPSHOT_DIR = DATA_DIR / "demo_uploads_snapshot"

SNAPSHOT_MODELS = [
    User,
    DomainMemory,
    Project,
    Document,
    Chunk,
    ChunkEntity,
    DocumentMap,
    GraphEdge,
    DomainLandscape,
    Annotation,
    ComparisonMatrix,
    Draft,
    DraftSnapshot,
    Citation,
    ChatSession,
    ChatMessage,
    AiFeedback,
    ScoreFeedback,
]

ALL_MODELS = SNAPSHOT_MODELS + [ContextCache, ResultCache, UserLog, HealthReport]


def _encode(value):
    if isinstance(value, bytes):
        return {"__b64__": base64.b64encode(value).decode("ascii")}
    if isinstance(value, datetime):
        return {"__dt__": value.isoformat()}
    return value


def _decode(value, model, key):
    if isinstance(value, dict) and "__b64__" in value:
        return base64.b64decode(value["__b64__"])
    if isinstance(value, dict) and "__dt__" in value:
        return datetime.fromisoformat(value["__dt__"])
    if isinstance(value, str):
        col = inspect(model).mapper.column_attrs.get(key)
        if col is not None and isinstance(col.columns[0].type, DateTime):
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                pass
    return value


def export_fixture() -> Path:
    data = {}
    with SessionLocal() as db:
        for model in SNAPSHOT_MODELS:
            rows = db.query(model).all()
            cols = [c.key for c in inspect(model).mapper.column_attrs]
            data[model.__tablename__] = [
                {c: _encode(getattr(row, c)) for c in cols} for row in rows
            ]
    FIXTURE_PATH.write_text(json.dumps(data, ensure_ascii=False, default=str))
    uploads = DATA_DIR / "uploads"
    if UPLOADS_SNAPSHOT_DIR.exists():
        shutil.rmtree(UPLOADS_SNAPSHOT_DIR)
    if uploads.exists():
        shutil.copytree(uploads, UPLOADS_SNAPSHOT_DIR)
    return FIXTURE_PATH


def restore_demo() -> dict:
    if not FIXTURE_PATH.exists():
        raise FileNotFoundError("演示快照不存在，请先运行种子脚本")
    data = json.loads(FIXTURE_PATH.read_text())
    with SessionLocal() as db:
        for model in reversed(ALL_MODELS):
            db.query(model).delete(synchronize_session=False)
        db.commit()
        for model in SNAPSHOT_MODELS:
            table = model.__tablename__
            if table not in data:
                continue
            cols = {c.key for c in inspect(model).mapper.column_attrs}
            for row in data[table]:
                values = {}
                for k, v in row.items():
                    if k not in cols:
                        continue
                    values[k] = _decode(v, model, k)
                db.add(model(**values))
            db.commit()
    uploads = DATA_DIR / "uploads"
    if uploads.exists():
        shutil.rmtree(uploads)
    if UPLOADS_SNAPSHOT_DIR.exists():
        shutil.copytree(UPLOADS_SNAPSHOT_DIR, uploads)
    else:
        uploads.mkdir(parents=True, exist_ok=True)
    with SessionLocal() as db:
        docs = db.query(Document).count()
        chunks = db.query(Chunk).count()
    return {"documents": docs, "chunks": chunks}
