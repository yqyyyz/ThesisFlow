from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    research_question: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    research_question: str | None = None
    stage: str | None = None


class ProjectOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: str | None
    research_question: str | None
    stage: str
    created_at: datetime
    doc_count: int = 0

    model_config = {"from_attributes": True}


class DocumentOut(BaseModel):
    id: int
    project_id: int | None
    file_name: str | None
    doi: str | None
    title: str | None
    authors: list | None
    venue: str | None
    year: int | None
    cited_by: int | None
    status: str
    error_msg: str | None
    scores: dict | None
    weighted_score: float | None
    summary_cache: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DoiImportRequest(BaseModel):
    dois: list[str]
    research_question: str | None = None


class WeightUpdate(BaseModel):
    weights: dict[str, float]


class BatchImportResult(BaseModel):
    accepted: list[DocumentOut]
    task_ids: list[int]
