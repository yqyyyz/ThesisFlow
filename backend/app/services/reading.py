import json
import re

from sqlalchemy.orm import Session

from app.core.llm import chat
from app.models.literature import Chunk, Document
from app.prompts.templates import concept_explain_prompt, pre_read_prompt

TIER_BASE = 0
TIER_MID_SCORE = 1
TIER_TOP_ANNOTATED = 2

TAG_LABELS = ["重点论据", "借鉴方法", "存疑之处", "背景知识"]


def promote_chunk_tier(db: Session, chunk_key: str) -> None:
    chunk = db.query(Chunk).filter(Chunk.chunk_key == chunk_key).first()
    if chunk and chunk.tier < TIER_TOP_ANNOTATED:
        chunk.tier = TIER_TOP_ANNOTATED


def find_chunk_for_quote(db: Session, doc_id: int, quote_text: str) -> Chunk | None:
    cleaned = " ".join(quote_text.split())
    candidates = db.query(Chunk).filter(Chunk.doc_id == doc_id).all()
    best = None
    best_overlap = 0
    q_words = set(cleaned)
    for c in candidates:
        content_norm = " ".join(c.content.split())
        if cleaned in content_norm:
            return c
        overlap = len(q_words & set(content_norm))
        if overlap > best_overlap:
            best_overlap = overlap
            best = c
    if best and best_overlap / max(len(q_words), 1) > 0.6:
        return best
    return None


def generate_pre_read(db: Session, doc: Document) -> tuple[str, dict | None]:
    chunks = (
        db.query(Chunk)
        .filter(Chunk.doc_id == doc.id)
        .order_by(Chunk.id)
        .all()
    )
    abstract = next((c.content for c in chunks if c.typed_label == "abstract"), "")
    head_text = "\n\n".join(c.content for c in chunks[:3])[:3000]
    if not head_text and abstract:
        head_text = abstract[:2000]
    prompt = pre_read_prompt(doc.title or "（未知标题）", abstract, head_text)
    raw = chat(
        "LIGHT", [{"role": "user", "content": prompt}], temperature=0.4, json_mode=True
    )
    raw = re.sub(r"(?im)^#\s*一页纸.*$", "", raw).strip()
    m = re.search(r"\{.*\}", raw, re.S)
    structured = None
    if m:
        try:
            parsed = json.loads(m.group(0))
            if isinstance(parsed, dict) and "core_question" in parsed:
                structured = parsed
        except json.JSONDecodeError:
            pass
    return raw, structured


def explain_concept(term: str, context: str | None) -> str:
    prompt = concept_explain_prompt(term, context or "")
    return chat("LIGHT", [{"role": "user", "content": prompt}], temperature=0.5)
