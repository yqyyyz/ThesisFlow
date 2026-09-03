import re
from pathlib import Path

from app.services.parsing import Section


def normalize_ws(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text).strip()


def parse_docx(path: Path) -> dict:
    from docx import Document as DocxDocument

    doc = DocxDocument(str(path))
    title_guess = ""
    try:
        core_title = doc.core_properties.title or ""
        if core_title and 2 < len(core_title) < 300:
            title_guess = core_title
    except Exception:
        pass

    sections: list[Section] = []
    content_struct: list[dict] = []
    full_parts: list[str] = []
    char_cursor = 0
    cur_title = ""
    cur_paras: list[str] = []
    cur_start = 0

    def flush():
        nonlocal cur_paras, cur_start, cur_title
        if cur_paras:
            text = "\n\n".join(cur_paras)
            sections.append(
                Section(
                    title=cur_title,
                    text=text,
                    page_no=0,
                    char_start=cur_start,
                    char_end=cur_start + len(text),
                )
            )
            content_struct.append({"title": cur_title, "paragraphs": list(cur_paras)})
        cur_paras = []

    for para in doc.paragraphs:
        text = normalize_ws(para.text or "")
        if not text:
            continue
        style = (para.style.name or "").lower() if para.style else ""
        is_heading = (
            style.startswith("heading") or style.startswith("标题") or style == "title"
        )
        if is_heading:
            flush()
            cur_title = text
            cur_start = char_cursor
            full_parts.append(text)
            char_cursor += len(text) + 2
            if not title_guess and len(text) < 200:
                title_guess = text
        else:
            if not cur_paras:
                cur_start = char_cursor
            cur_paras.append(text)
            full_parts.append(text)
            char_cursor += len(text) + 2
    flush()

    if not title_guess and full_parts:
        title_guess = full_parts[0][:200]
    return {
        "sections": sections,
        "full_text": "\n\n".join(full_parts),
        "title_guess": title_guess,
        "content_struct": content_struct,
        "abstract": "",
        "references_text": "",
    }


def parse_markdown(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    title_guess = ""
    sections: list[Section] = []
    content_struct: list[dict] = []
    full_parts: list[str] = []
    char_cursor = 0
    cur_title = ""
    cur_paras: list[str] = []
    cur_start = 0
    para_buf: list[str] = []

    def flush_para():
        nonlocal para_buf
        if para_buf:
            text = " ".join(para_buf)
            if not cur_paras:
                cur_paras.append("")
            cur_paras[-1] = (cur_paras[-1] + "\n" + text).strip() if cur_paras[-1] else text
            para_buf = []

    def flush_section():
        nonlocal cur_paras, cur_start, cur_title
        flush_para()
        if cur_paras:
            text = "\n\n".join(p for p in cur_paras if p)
            sections.append(
                Section(
                    title=cur_title,
                    text=text,
                    page_no=0,
                    char_start=cur_start,
                    char_end=cur_start + len(text),
                )
            )
            content_struct.append(
                {"title": cur_title, "paragraphs": [p for p in cur_paras if p]}
            )
        cur_paras = []

    for line in raw.split("\n"):
        m = re.match(r"^(#{1,6})\s+(.+)$", line)
        if m:
            flush_section()
            cur_title = normalize_ws(m.group(2))
            cur_start = char_cursor
            full_parts.append(cur_title)
            char_cursor += len(cur_title) + 2
            if not title_guess and len(cur_title) < 200:
                title_guess = cur_title
        elif line.strip():
            flush_para()
            text = normalize_ws(line)
            if not cur_paras:
                cur_start = char_cursor
            cur_paras.append(text)
            full_parts.append(text)
            char_cursor += len(text) + 2
        else:
            flush_para()
    flush_section()

    if not title_guess and full_parts:
        title_guess = full_parts[0][:200]
    return {
        "sections": sections,
        "full_text": "\n\n".join(full_parts),
        "title_guess": title_guess,
        "content_struct": content_struct,
        "abstract": "",
        "references_text": "",
    }
