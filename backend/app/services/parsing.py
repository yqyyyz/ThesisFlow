import re
from dataclasses import dataclass, field
from pathlib import Path

import fitz

KNOWN_HEADINGS = {
    "abstract", "introduction", "related work", "background", "method",
    "methods", "methodology", "approach", "model", "data", "experiments",
    "experiment", "empirical results", "results", "evaluation", "discussion",
    "analysis", "conclusion", "conclusions", "concluding remarks",
    "references", "bibliography", "appendix", "acknowledgments",
    "acknowledgements", "data availability", "摘要", "引言", "结论", "参考文献",
}

HEADING_NUM_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)[.\s]\s*(\S.*)$")
HEADING_CN_RE = re.compile(r"^\s*([一二三四五六七八九十]+)、\s*(\S.*)$")

TITLE_BLACKLIST_KEYWORDS = (
    "nber working paper", "working paper series", "working paper",
    "arxiv:", "arxiv preprint", "provided proper attribution",
    "grants permission", "copyright", "©", "http", "doi:", "issn",
    "preprint", "under review", "draft:", "not for distribution",
    "preliminary", "technical report", "discussion paper",
    "journal of", "proceedings of", "first draft", "this version:",
    "word count", "摘要", "摘 要",
)


@dataclass
class Section:
    title: str
    text: str
    page_no: int
    char_start: int
    char_end: int


@dataclass
class ParseResult:
    pdf_type: str
    title_guess: str = ""
    title_confidence: str = "low"
    sections: list[Section] = field(default_factory=list)
    full_text: str = ""
    abstract: str = ""
    references_text: str = ""
    page_count: int = 0


def normalize_text(text: str) -> str:
    text = re.sub(r"-\n(?=[a-z])", "", text)
    text = re.sub(r"\n(?=[a-zA-Z\u4e00-\u9fff'(])", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


# 标题尾部若跟随一串"大写开头人名"（作者列表），将其剥离
_AUTHOR_TAIL_RE = re.compile(
    r"\s+([A-Z][a-zA-Z'\.\-]+(?:\s+[A-Z][a-zA-Z'\.\-]+){1,})\s*$"
)


def _split_title_authors(cand: str) -> str:
    """全大写标题后接作者列表（首字母大写+小写）时，在边界处切分"""
    words = cand.split()
    split_idx = None
    for i in range(1, len(words)):
        prev, cur = words[i - 1], words[i]
        if not cur:
            continue
        if (
            len(prev) > 1
            and prev.replace(":", "").replace(",", "").isupper()
            and cur[0].isupper()
            and any(ch.islower() for ch in cur)
        ):
            split_idx = i
            break
    if split_idx and split_idx >= 3:
        return " ".join(words[:split_idx])
    return cand


def _strip_author_tail(cand: str) -> str:
    m = _AUTHOR_TAIL_RE.search(cand)
    if not m:
        return cand
    tail = m.group(1)
    stripped = cand[: m.start()].strip()
    tail_words = tail.split()
    has_lower = any(any(ch.islower() for ch in w) for w in tail_words)
    if len(stripped) >= 10 and len(tail_words) >= 2 and has_lower:
        return stripped
    return cand


def _looks_like_heading(line: str, is_bold: bool, font_size: float) -> bool:
    line = line.strip()
    if not line or len(line) > 90:
        return False
    if line.lower() in KNOWN_HEADINGS:
        return True
    if font_size >= 13.5 and len(line.split()) <= 14 and not line.endswith(
        (".", "。", ",", "，", ";", "；", ":", "：")
    ):
        return True
    if HEADING_NUM_RE.match(line) and (is_bold or font_size >= 10.5):
        return True
    if HEADING_CN_RE.match(line):
        return True
    if is_bold and font_size >= 11 and len(line.split()) <= 12 and not line.endswith(
        (".", "。", ",", "，", ";", "；", ":", "：")
    ):
        return True
    return False


def detect_pdf_type(doc: fitz.Document) -> str:
    sample_pages = min(5, doc.page_count)
    text_len = sum(len(doc[i].get_text()) for i in range(sample_pages))
    return "text" if text_len > 300 else "scanned"


def _iter_paragraphs(doc: fitz.Document):
    for page_no in range(doc.page_count):
        data = doc[page_no].get_text("dict")
        for block in data.get("blocks", []):
            if block.get("type") != 0:
                continue
            bold_chars = 0
            total_chars = 0
            max_size = 0.0
            lines_text = []
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue
                lines_text.append("".join(s.get("text", "") for s in spans))
                for s in spans:
                    t = s.get("text", "")
                    total_chars += len(t)
                    if "bold" in (s.get("font") or "").lower():
                        bold_chars += len(t)
                    max_size = max(max_size, s.get("size", 0.0))
            text = "\n".join(lines_text).strip()
            if not text:
                continue
            is_bold = total_chars > 0 and bold_chars / max(total_chars, 1) > 0.6
            yield page_no, text, is_bold, max_size


def parse_pdf(path: Path) -> ParseResult:
    doc = fitz.open(path)
    try:
        pdf_type = detect_pdf_type(doc)
        result = ParseResult(pdf_type=pdf_type, page_count=doc.page_count)
        if pdf_type == "scanned":
            return result

        raw_blocks = list(_iter_paragraphs(doc))
        paragraphs: list[dict] = []
        for page_no, text, is_bold, font_size in raw_blocks:
            buf: list[str] = []
            for line in text.split("\n"):
                stripped = line.strip()
                if not stripped:
                    continue
                is_heading = (
                    len(stripped) < 90
                    and not stripped.endswith((".", "。", ",", "，", ";", "；"))
                    and _looks_like_heading(line, is_bold, font_size)
                )
                if is_heading:
                    if buf:
                        joined = normalize_text(" ".join(buf))
                        if joined:
                            paragraphs.append(
                                {"text": joined, "page": page_no, "heading": False,
                                 "size": 0.0}
                            )
                        buf = []
                    paragraphs.append(
                        {
                            "text": normalize_text(stripped),
                            "page": page_no,
                            "heading": True,
                            "size": font_size,
                        }
                    )
                else:
                    buf.append(stripped)
            if buf:
                joined = normalize_text(" ".join(buf))
                if joined:
                    paragraphs.append({"text": joined, "page": page_no, "heading": False,
                                       "size": font_size})

        full_parts: list[str] = []
        offsets: list[int] = []
        cursor = 0
        for p in paragraphs:
            offsets.append(cursor)
            full_parts.append(p["text"])
            cursor += len(p["text"]) + 1
        result.full_text = "\n".join(full_parts)

        section_starts: list[int] = []
        for i, p in enumerate(paragraphs):
            if p["heading"]:
                section_starts.append(i)
        if not section_starts or section_starts[0] != 0:
            section_starts.insert(0, 0)

        for k, start in enumerate(section_starts):
            end = section_starts[k + 1] if k + 1 < len(section_starts) else len(paragraphs)
            heading_para = paragraphs[start]
            body_parts = [p["text"] for p in paragraphs[start:end]]
            if heading_para["heading"]:
                title = heading_para["text"]
                body_parts = body_parts[1:]
            else:
                title = ""
            text = normalize_text("\n\n".join(body_parts))
            if not text.strip():
                continue
            result.sections.append(
                Section(
                    title=title,
                    text=text,
                    page_no=heading_para["page"],
                    char_start=offsets[start],
                    char_end=offsets[end - 1] + len(paragraphs[end - 1]["text"]),
                )
            )

        def _blacklisted(t: str) -> bool:
            low = t.lower()
            return any(w in low for w in TITLE_BLACKLIST_KEYWORDS)

        def _is_boilerplate(t: str) -> bool:
            low = t.lower()
            return _blacklisted(t) or any(
                w in low for w in ("permission", "attribution", "license")
            )

        meta_title = (doc.metadata or {}).get("title", "").strip()
        meta_valid = (
            meta_title
            and 4 < len(meta_title) < 300
            and not meta_title.lower().endswith(".pdf")
            and not _blacklisted(meta_title)
        )

        page0_blocks = [
            (normalize_text(t.replace("\n", " ")), s)
            for pg, t, _b, s in raw_blocks
            if pg == 0
        ]
        page0_blocks = [(t, s) for t, s in page0_blocks if t]
        font_title = ""
        if page0_blocks:
            max_size = max(s for _, s in page0_blocks)
            threshold = max(0.85 * max_size, 11.0)
            groups: list[list[str]] = []
            cur: list[str] = []
            for text, size in page0_blocks:
                if size >= threshold and len(text) < 250 and not _blacklisted(text):
                    cur.append(text)
                else:
                    if cur:
                        groups.append(cur)
                        cur = []
                    if len(" ".join(sum(groups, []))) > 150:
                        break
            if cur:
                groups.append(cur)
            for g in groups:
                cand = normalize_text(" ".join(g))
                cand = _split_title_authors(cand)
                if 8 <= len(cand) <= 300:
                    font_title = cand
                    break

        head_para = ""
        title_run: list[str] = []
        seen_content = 0
        for page_no, text, is_bold, font_size in raw_blocks:
            if page_no != 0:
                break
            block_text = normalize_text(text.replace("\n", " "))
            if not block_text or _is_boilerplate(block_text):
                continue
            seen_content += 1
            if seen_content > 8:
                break
            if (is_bold or font_size >= 13.5) and len(block_text) < 250:
                title_run.append(block_text)
                if len(title_run) == 3:
                    break
            elif title_run:
                break
        if title_run:
            head_para = normalize_text(" ".join(title_run))
        first_para = ""
        for p in paragraphs[:6]:
            cand = p["text"].strip()
            if (8 < len(cand) < 200 and not p["heading"]
                    and not _is_boilerplate(cand) and cand.lower() not in KNOWN_HEADINGS):
                first_para = cand
                break
        if meta_valid:
            result.title_guess = meta_title
            result.title_confidence = "high"
        elif font_title:
            result.title_guess = font_title
            result.title_confidence = "high"
        elif head_para and len(head_para) >= 8:
            result.title_guess = head_para
            result.title_confidence = "medium"
        elif first_para:
            result.title_guess = first_para
            result.title_confidence = "low"

        for sec in result.sections:
            low = sec.title.lower()
            if low in ("abstract", "摘要"):
                result.abstract = sec.text
            elif low in ("references", "bibliography", "参考文献"):
                result.references_text = sec.text
        if not result.abstract:
            m = re.search(
                r"(?is)\babstract\b[:\s—-]*(.{100,2500}?)(?=(?:1[\.\s]+\w)|(?:introduction)|(?:引言)|(?:一、))",
                result.full_text,
            )
            if m:
                result.abstract = normalize_text(m.group(1))
        return result
    finally:
        doc.close()


def locate_bbox(path: Path, query_text: str, prefer_page: int | None = None) -> dict | None:
    snippet = re.sub(r"\s+", " ", query_text)[:60].strip()
    if len(snippet) < 8:
        return None
    doc = fitz.open(path)
    try:
        candidates = list(range(doc.page_count))
        if prefer_page is not None and 0 <= prefer_page < doc.page_count:
            priority = [p for p in range(prefer_page, min(prefer_page + 3, doc.page_count))]
            candidates = priority + [p for p in candidates if p not in priority]
        for page_no in candidates:
            rects = doc[page_no].search_for(snippet)
            if rects:
                r = rects[0]
                return {
                    "page": page_no + 1,
                    "x0": round(r.x0, 1),
                    "y0": round(r.y0, 1),
                    "x1": round(r.x1, 1),
                    "y1": round(r.y1, 1),
                }
        return None
    finally:
        doc.close()
