from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ContextCache(Base):
    __tablename__ = "context_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope: Mapped[str] = mapped_column(String(128), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class ResultCache(Base):
    __tablename__ = "result_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope: Mapped[str] = mapped_column(String(128), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), index=True)
    query: Mapped[str] = mapped_column(Text)
    answer: Mapped[dict] = mapped_column(JSON, default=dict)
    provenance: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class ChunkEntity(Base):
    __tablename__ = "chunk_entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chunk_key: Mapped[str] = mapped_column(String(64), index=True)
    doc_id: Mapped[int] = mapped_column(Integer, index=True)
    entity: Mapped[str] = mapped_column(String(64), index=True)
    weight: Mapped[float | None] = mapped_column(nullable=True)


class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(Integer, index=True)
    source_doc: Mapped[int] = mapped_column(Integer, index=True)
    target_doc: Mapped[int] = mapped_column(Integer, index=True)
    relation: Mapped[str] = mapped_column(String(24))
    label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    evidence_chunks: Mapped[list | None] = mapped_column(JSON, nullable=True)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
