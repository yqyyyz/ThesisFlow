import re
import subprocess
import time
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import EXPORT_DIR, UPLOAD_DIR
from app.models.literature import Document
from app.models.user import User

CITATION_RE = re.compile(r"\[(\d+):(\d+)\]")


def _plain_text(content_json: dict | None) -> str:
    if not content_json or "content" not in content_json:
        return ""
    parts: list[str] = []

    def walk(nodes):
        for node in nodes:
            t = node.get("type")
            if t == "text":
                parts.append(node.get("text", ""))
            elif t == "paragraph":
                walk(node.get("content", []))
                parts.append("\n\n")
            elif t in ("heading",):
                level = node.get("attrs", {}).get("level", 1)
                parts.append("#" * level + " ")
                walk(node.get("content", []))
                parts.append("\n\n")
            elif t == "bulletList" or t == "orderedList":
                for item in node.get("content", []):
                    parts.append("- " if t == "bulletList" else "1. ")
                    walk(item.get("content", []))
                parts.append("\n")
            elif t == "citation":
                attrs = node.get("attrs", {}) or {}
                chunk_key = str(attrs.get("chunkKey", "") or "")
                doc_id = (
                    attrs.get("doc_id")
                    or attrs.get("docId")
                    or (chunk_key.split(":")[0] if ":" in chunk_key else "")
                    or ""
                )
                seq = (
                    attrs.get("chunk_seq")
                    or attrs.get("chunkSeq")
                    or (chunk_key.split(":")[1] if ":" in chunk_key else "")
                    or ""
                )
                parts.append(f"[{doc_id}:{seq}]")
            else:
                walk(node.get("content", []))

    walk(content_json.get("content", []))
    return "".join(parts).strip()


def _format_reference(doc: Document, index: int, style: str) -> str:
    authors = ", ".join(doc.authors[:6]) if doc.authors else "未知作者"
    year = doc.year or "n.d."
    title = doc.title or "无标题"
    venue = doc.venue or ""
    if style.upper().startswith("APA"):
        venue_part = f". *{venue}*" if venue else ""
        return f"[{index}] {authors} ({year}). {title}{venue_part}."
    if style.upper().startswith("MLA"):
        venue_part = f" {venue}," if venue else ""
        return f"[{index}] {authors}. \"{title}.\"{venue_part} {year}."
    return f"[{index}] {authors}. {title}. {venue}. {year}."


def build_markdown(db: Session, draft, user) -> tuple[str, dict[int, int]]:
    text = _plain_text(draft.content_json)
    doc_ids = sorted({int(m.group(1)) for m in CITATION_RE.finditer(text)})
    numbering: dict[int, int] = {}
    refs_lines = []
    for i, doc_id in enumerate(doc_ids, 1):
        numbering[doc_id] = i
        doc = db.get(Document, doc_id)
        if doc:
            refs_lines.append(_format_reference(doc, i, user.citation_style if user else "APA"))

    def repl(m: re.Match) -> str:
        doc_id = int(m.group(1))
        return f"[^{numbering[doc_id]}]" if doc_id in numbering else ""

    body = CITATION_RE.sub(repl, text)
    if refs_lines:
        body += "\n\n## 参考文献\n\n" + "\n".join(f"[^{i}]: {line.split('] ', 1)[-1] if '] ' in line else line}" for i, line in enumerate(refs_lines, 1))
    return body, numbering


def export_draft(db: Session, draft, fmt: str) -> Path:
    user = db.get(User, 1)
    body, _ = build_markdown(db, draft, user)
    ts = time.strftime("%Y%m%d_%H%M%S")
    safe_title = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", draft.title)[:40]
    md_path = EXPORT_DIR / f"{safe_title}_{ts}.md"
    md_path.write_text(body, encoding="utf-8")
    if fmt == "md":
        return md_path
    out_suffix = {"docx": ".docx", "tex": ".tex", "pdf": ".pdf"}[fmt]
    out_path = md_path.with_suffix(out_suffix)
    cmd = ["pandoc", str(md_path), "-o", str(out_path), "--standalone"]
    if fmt == "pdf":
        cmd += ["--pdf-engine=xelatex", "-V", "CJKmainfont=Songti SC"]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        return out_path
    except (subprocess.CalledProcessError, FileNotFoundError):
        if fmt == "pdf":
            out_path = md_path.with_suffix(".pdf")
            subprocess.run(
                ["pandoc", str(md_path), "-o", str(out_path), "--pdf-engine=typst"],
                check=True,
                capture_output=True,
                timeout=120,
            )
            return out_path
        raise
