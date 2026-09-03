import re
from collections.abc import Iterator

from sqlalchemy.orm import Session

from app.config import settings
from app.core.llm import chat_stream, embed
from app.core.vectors import cosine_similarity
from app.models.drafting import Citation, Draft
from app.models.literature import Chunk
from app.models.user import DomainMemory, User
from app.prompts.templates import writing_strong_prompt

CITATION_RE = re.compile(r"\[(\d+):(\d+)\]")


class CitationParser:
    """流式扫描 [doc_id:chunk_id] 标记的有限状态机"""

    def __init__(self):
        self.buffer = ""
        self.citations: list[str] = []

    def feed(self, delta: str) -> Iterator[tuple[str, str | None]]:
        self.buffer += delta
        while True:
            m = CITATION_RE.search(self.buffer)
            if not m:
                bracket = self.buffer.rfind("[")
                if bracket == -1:
                    if self.buffer:
                        yield ("text", self.buffer)
                        self.buffer = ""
                    break
                if len(self.buffer) - bracket > 12:
                    yield ("text", self.buffer)
                    self.buffer = ""
                    break
                yield ("text", self.buffer[:bracket])
                self.buffer = self.buffer[bracket:]
                break
            yield ("text", self.buffer[: m.start()])
            key = f"{m.group(1)}:{m.group(2)}"
            self.citations.append(key)
            yield ("citation", key)
            self.buffer = self.buffer[m.end():]

    def flush(self) -> Iterator[tuple[str, str | None]]:
        if self.buffer:
            yield ("text", self.buffer)
            self.buffer = ""


def build_system_prompt(db: Session, user_id: int = 1) -> str:
    user = db.get(User, user_id)
    base = (
        "你是资深学术审稿人与科研协作者，表达严谨、客观、克制，"
        "优先依据证据而非修辞，绝不编造引用与结论。"
    )
    if not user:
        return base
    user_ctx = (
        f"用户身份：{user.identity}；研究领域：{user.discipline}"
        f"{'/' + user.sub_discipline if user.sub_discipline else ''}；"
        f"引用规范偏好：{user.citation_style}；写作语言：{user.language_pref}。"
    )
    memories = (
        db.query(DomainMemory)
        .filter(DomainMemory.user_id == user_id, DomainMemory.status == "active")
        .order_by(DomainMemory.confidence.desc(), DomainMemory.id.asc())
        .limit(10)
        .all()
    )
    mem_lines = "\n".join(
        f"- {m.content}（置信度 {round(m.confidence, 2):.2f}）" for m in memories
    )
    domain = f"用户长期研究中沉淀的偏好：\n{mem_lines}" if mem_lines else "（暂无沉淀偏好）"
    return f"[Base_Persona]\n{base}\n\n[User_Context]\n{user_ctx}\n\n[Domain_Memory]\n{domain}"


def continue_stream(
    db: Session,
    draft: Draft,
    outline_path: str,
    window_text: str,
    instruction: str | None,
    selected_notes: str,
    evidence_block: str,
    evidence_keys: list[str],
    drafting_context: str | None = None,
) -> Iterator[tuple[str, str]]:
    system = build_system_prompt(db, 1)
    user = db.get(User, 1)
    citation_style = user.citation_style if user else "APA"
    user_prompt = writing_strong_prompt(
        outline_path,
        window_text,
        selected_notes,
        evidence_block,
        instruction or "续写",
        citation_style,
        drafting_context,
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_prompt},
    ]
    parser = CitationParser()
    full_text_parts: list[str] = []
    for delta in chat_stream("STRONG", messages, temperature=0.4):
        for kind, payload in parser.feed(delta):
            if kind == "text" and payload:
                full_text_parts.append(payload)
                yield ("token", payload)
            elif kind == "citation" and payload:
                full_text_parts.append(f"[{payload}]")
                yield ("citation", payload)
    for kind, payload in parser.flush():
        if kind == "text" and payload:
            full_text_parts.append(payload)
            yield ("token", payload)
    full_text = "".join(full_text_parts)
    yield ("done", full_text)


def verify_citations(
    db: Session, draft_id: int, generated_text: str, evidence_keys: list[str]
) -> list[dict]:
    """双阶段校验（vector 快筛 + NLI 边缘判定），实现见 services/verification.py"""
    from app.services.verification import verify_citations as _verify

    return _verify(db, draft_id, generated_text, evidence_keys)
