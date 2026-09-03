from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DOC_STATUS = [
    "uploaded",
    "dedup_checked",
    "parsing",
    "chunked",
    "embedding",
    "scoring",
    "ready",
    "failed",
]


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    research_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[str] = mapped_column(String(24), default="topic")
    discipline_profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    progress_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True, index=True
    )
    file_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    doi: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    authors: Mapped[list | None] = mapped_column(JSON, nullable=True)
    venue: Mapped[str | None] = mapped_column(String(255), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cited_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pdf_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    kind: Mapped[str] = mapped_column(String(8), default="pdf")
    content_struct: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="uploaded", index=True)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    summary_cache: Mapped[str | None] = mapped_column(Text, nullable=True)
    title_embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    @property
    def weighted_score(self) -> float | None:
        if not self.scores:
            return None
        dims = ("quality", "relevance", "methodology", "novelty")
        vals = [self.scores[d]["score"] for d in dims if d in self.scores]
        return sum(vals) / len(vals) if vals else None


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    chunk_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    tier: Mapped[int] = mapped_column(Integer, default=0, index=True)
    typed_label: Mapped[str] = mapped_column(String(16), default="body")
    content: Mapped[str] = mapped_column(Text)
    section_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    char_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    char_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    parent_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Annotation(Base):
    __tablename__ = "annotations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    chunk_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    kind: Mapped[str] = mapped_column(String(16))
    tag_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DocumentMap(Base):
    __tablename__ = "document_maps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(Integer, index=True)
    signature: Mapped[str] = mapped_column(String(64))
    map_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class ComparisonMatrix(Base):
    __tablename__ = "comparison_matrices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    field_config: Mapped[list] = mapped_column(JSON, default=list)
    cell_content: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class ScoreFeedback(Base):
    __tablename__ = "score_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True, index=True
    )
    doc_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    dim: Mapped[str] = mapped_column(String(32))
    model_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_score: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
