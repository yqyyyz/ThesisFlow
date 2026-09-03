from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), default="demo@thesisflow.local")
    name: Mapped[str] = mapped_column(String(128), default="Demo 研究员")
    identity: Mapped[str] = mapped_column(String(64), default="博士生")
    discipline: Mapped[str] = mapped_column(String(128), default="")
    sub_discipline: Mapped[str] = mapped_column(String(128), default="")
    citation_style: Mapped[str] = mapped_column(String(32), default="APA")
    language_pref: Mapped[str] = mapped_column(String(32), default="中文")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class DomainMemory(Base):
    __tablename__ = "domain_memories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    content: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(16), default="implicit")
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    trigger_count: Mapped[int] = mapped_column(Integer, default=0)
    source_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    conflict_with: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class UserLog(Base):
    """本地观测日志：记录每次 LLM 调用与引用校验结果（Langfuse 的本地降级方案）"""

    __tablename__ = "user_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    slot: Mapped[str | None] = mapped_column(String(16), nullable=True)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
