from dataclasses import dataclass

from app.config import settings
from app.core.llm import approx_tokens


@dataclass
class ChunkDraft:
    chunk_key: str
    content: str
    section_title: str
    typed_label: str
    page_no: int | None
    char_start: int | None
    char_end: int | None


def _split_to_target(text: str, section_title: str, typed_label: str,
                     page_no: int | None, base_offset: int) -> list[ChunkDraft]:
    if not text.strip():
        return []
    min_c = int(settings.chunk_min_tokens * 1.6)
    max_c = int(settings.chunk_max_tokens * 1.6)
    overlap_c = int((max_c - min_c) * settings.chunk_overlap) + int(settings.chunk_min_tokens * settings.chunk_overlap)
    if len(text) <= max_c:
        return [ChunkDraft("", text, section_title, typed_label, page_no,
                           base_offset, base_offset + len(text))]

    paragraphs = text.split("\n")
    pieces: list[tuple[str, int]] = []
    pos = 0
    for para in paragraphs:
        idx = text.find(para, pos)
        pieces.append((para, idx))
        pos = idx + len(para)

    drafts: list[ChunkDraft] = []
    cur: list[str] = []
    cur_len = 0
    cur_start = 0
    for para, idx in pieces:
        if cur and cur_len + len(para) > max_c:
            drafts.append(ChunkDraft("", "\n".join(cur), section_title, typed_label,
                                     page_no, base_offset + cur_start,
                                     base_offset + idx))
            tail = []
            tail_len = 0
            for chunk_para in reversed(cur):
                if tail_len + len(chunk_para) > overlap_c:
                    break
                tail.insert(0, chunk_para)
                tail_len += len(chunk_para)
            cur = tail
            cur_len = tail_len
            cur_start = idx - overlap_c if idx > overlap_c else 0
        if not cur:
            cur_start = idx
        cur.append(para)
        cur_len += len(para) + 1
    if cur:
        drafts.append(ChunkDraft("", "\n".join(cur), section_title, typed_label,
                                 page_no, base_offset + cur_start,
                                 base_offset + len(text)))
    return drafts


def _looks_like_conclusion(title: str) -> bool:
    low = title.lower()
    return "conclusion" in low or "concluding" in low or "结论" in low or "结语" in low


def build_chunks(doc_id: int, sections: list, abstract: str, references_text: str) -> list[ChunkDraft]:
    drafts: list[ChunkDraft] = []

    if abstract.strip():
        drafts.append(ChunkDraft("", abstract.strip(), "Abstract", "abstract", 1, 0, len(abstract)))

    for sec in sections:
        if sec.title.lower() in ("abstract", "摘要"):
            continue
        if sec.title.lower() in ("references", "bibliography", "参考文献"):
            continue
        typed = "conclusion" if _looks_like_conclusion(sec.title) else "body"
        drafts.extend(
            _split_to_target(sec.text, sec.title or "(未分节)", typed,
                             sec.page_no, sec.char_start)
        )

    if not drafts and references_text.strip():
        pass

    if references_text.strip():
        ref_piece = references_text[: int(settings.chunk_max_tokens * 1.6)]
        drafts.append(ChunkDraft("", ref_piece, "References", "refs", None, None, None))

    for i, d in enumerate(drafts):
        d.chunk_key = f"{doc_id}:{i + 1}"
    return drafts


# ---------- v2：Parent-Child 双粒度 ----------

PARENT_MIN = int(600 * 1.6)
PARENT_MAX = int(1500 * 1.6)
CHILD_MIN = int(200 * 1.6)
CHILD_MAX = int(400 * 1.6)


def _approx(text: str) -> int:
    return len(text)


def build_chunks_v2(
    doc_id: int, sections: list, abstract: str, references_text: str
) -> list[dict]:
    """返回扁平 dict 列表：
    - typed 单粒度块（abstract/conclusion/refs）：key 1..k，parent_key=None
    - 父块：key 9000+i，parent_key=None，不参与检索（装配单元）
    - 子块：key 100+i，parent_key=父块 key，检索单元
    """
    drafts: list[dict] = []
    seq = 0

    def next_typed_key() -> str:
        nonlocal seq
        seq += 1
        return f"{doc_id}:{seq}"

    def _add_typed(content: str, typed: str, section_title: str):
        if not content.strip():
            return
        drafts.append(
            {
                "chunk_key": next_typed_key(),
                "content": content.strip()[:3000],
                "section_title": section_title,
                "typed_label": typed,
                "page_no": None,
                "char_start": None,
                "char_end": None,
                "parent_key": None,
                "is_parent": False,
            }
        )

    if abstract.strip():
        _add_typed(abstract, "abstract", "Abstract")

    parent_seq = 0
    child_seq = 0
    for sec in sections:
        low = (sec.title or "").lower()
        if low in ("abstract", "摘要"):
            continue
        if low in ("references", "bibliography", "参考文献"):
            continue
        typed = "conclusion" if ("conclusion" in low or "结论" in low or "结语" in low) else "body"
        if typed == "conclusion":
            _add_typed(sec.text, "conclusion", sec.title or "结论")
            continue

        paragraphs = [p for p in sec.text.split("\n") if p.strip()]
        if not paragraphs:
            continue
        parent_buf: list[str] = []
        parent_len = 0

        def flush_parent():
            nonlocal parent_buf, parent_len, parent_seq, child_seq
            if not parent_buf:
                return
            parent_seq += 1
            parent_key = f"{doc_id}:{9000 + parent_seq}"
            parent_text = "\n".join(parent_buf)
            drafts.append(
                {
                    "chunk_key": parent_key,
                    "content": parent_text,
                    "section_title": sec.title or "(未分节)",
                    "typed_label": "body",
                    "page_no": getattr(sec, "page_no", None),
                    "char_start": getattr(sec, "char_start", None),
                    "char_end": getattr(sec, "char_end", None),
                    "parent_key": None,
                    "is_parent": True,
                }
            )
            cur: list[str] = []
            cur_len = 0
            overlap_target = int(CHILD_MIN * 0.15)
            for para in parent_buf:
                if cur and cur_len + _approx(para) > CHILD_MAX:
                    child_seq += 1
                    drafts.append(
                        {
                            "chunk_key": f"{doc_id}:{100 + child_seq}",
                            "content": "\n".join(cur),
                            "section_title": sec.title or "(未分节)",
                            "typed_label": "body",
                            "page_no": getattr(sec, "page_no", None),
                            "char_start": None,
                            "char_end": None,
                            "parent_key": parent_key,
                            "is_parent": False,
                        }
                    )
                    tail: list[str] = []
                    tail_len = 0
                    for p2 in reversed(cur):
                        if tail_len + _approx(p2) > overlap_target:
                            break
                        tail.insert(0, p2)
                        tail_len += _approx(p2)
                    cur = tail
                    cur_len = tail_len
                cur.append(para)
                cur_len += _approx(para) + 1
            if cur:
                child_seq += 1
                drafts.append(
                    {
                        "chunk_key": f"{doc_id}:{100 + child_seq}",
                        "content": "\n".join(cur),
                        "section_title": sec.title or "(未分节)",
                        "typed_label": "body",
                        "page_no": getattr(sec, "page_no", None),
                        "char_start": None,
                        "char_end": None,
                        "parent_key": parent_key,
                        "is_parent": False,
                    }
                )
            parent_buf = []
            parent_len = 0

        for para in paragraphs:
            if parent_len + _approx(para) > PARENT_MIN and parent_len >= PARENT_MIN:
                flush_parent()
            if parent_len + _approx(para) > PARENT_MAX and parent_buf:
                flush_parent()
            parent_buf.append(para)
            parent_len += _approx(para) + 1
        flush_parent()

    if references_text.strip():
        _add_typed(references_text[: int(PARENT_MAX)], "refs", "References")

    return drafts
