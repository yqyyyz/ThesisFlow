from datetime import datetime

from pydantic import BaseModel


class ChunkOut(BaseModel):
    chunk_key: str
    content: str
    section_title: str | None
    typed_label: str
    page_no: int | None
    tier: int
    token_count: int

    model_config = {"from_attributes": True}


class AnnotationCreate(BaseModel):
    chunk_key: str | None = None
    kind: str
    tag_label: str | None = None
    text: str | None = None
    quote_text: str | None = None
    page_no: int | None = None
    bbox: dict | None = None


class AnnotationOut(BaseModel):
    id: int
    doc_id: int
    chunk_key: str | None
    kind: str
    tag_label: str | None
    text: str | None
    quote_text: str | None
    page_no: int | None
    bbox: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PreReadOut(BaseModel):
    doc_id: int
    title: str | None
    markdown: str
    structured: dict | None
    scores: dict | None
    score_reasons: dict | None


class ExplainRequest(BaseModel):
    term: str
    context: str | None = None
