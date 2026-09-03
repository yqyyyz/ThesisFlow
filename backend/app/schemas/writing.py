from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DraftCreate(BaseModel):
    project_id: int
    title: str = "未命名草稿"
    outline: dict | None = None


class DraftUpdate(BaseModel):
    title: str | None = None
    content_json: dict | None = None
    outline_json: dict | None = None


class DraftOut(BaseModel):
    id: int
    project_id: int
    title: str
    content_json: Any
    outline_json: Any
    word_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SnapshotOut(BaseModel):
    id: int
    draft_id: int
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ContinueRequest(BaseModel):
    outline_path: str | None = None
    surrounding_text: str = ""
    instruction: str | None = None
    selected_note_keys: list[str] = []
    cursor_position: int | None = None
    drafting_context: str | None = None


class EditActionRequest(BaseModel):
    action: str
    selection: str
    extra_instruction: str | None = None


class ReviewRequest(BaseModel):
    text: str | None = None


class ExportRequest(BaseModel):
    format: str = "docx"


class CitationFeedbackRequest(BaseModel):
    status: str
