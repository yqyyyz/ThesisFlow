from sqlalchemy.orm import Session

from app.core.llm import chat
from app.models.literature import Document
from app.models.user import DomainMemory


def generate_landscape(db: Session, user_id: int = 1) -> tuple[str, list[int]]:
    kb_docs = db.query(Document).filter(Document.project_id.is_(None)).all()
    project_docs = db.query(Document).filter(Document.project_id.isnot(None)).all()

    doc_lines = []
    source_ids = []
    for d in kb_docs[:20]:
        if d.summary_cache and not d.summary_cache.startswith("<!--PREREAD-->"):
            summary = d.summary_cache[:200]
        elif d.summary_cache:
            summary = d.summary_cache[len("<!--PREREAD-->"):][:200]
        else:
            summary = ""
        doc_lines.append(f"- [领域库]《{d.title or d.file_name}》{(' venue:' + d.venue) if d.venue else ''}\n  {summary}")
        source_ids.append(d.id)
    for d in project_docs[:10]:
        if d.scores:
            doc_lines.append(
                f"- [项目]《{d.title or d.file_name}》四维总分 {sum(v['score'] for v in d.scores.values())/4:.1f}"
            )
            source_ids.append(d.id)

    memories = (
        db.query(DomainMemory)
        .filter(DomainMemory.user_id == user_id, DomainMemory.status == "active")
        .order_by(DomainMemory.confidence.desc())
        .limit(8)
        .all()
    )
    mem_lines = "\n".join(f"- {m.content}" for m in memories) or "（暂无）"

    prompt = f"""基于以下领域知识库材料与用户研究偏好，生成一份领域图景报告（Markdown 格式），包含三部分：

## 1. 核心研究边界
该领域当前的主要研究问题范围与理论边界。

## 2. 当前热点动态
值得关注的研究热点（若材料不足请如实说明）。

## 3. 前沿进展追踪
方法论或理论上的前沿方向，结合用户偏好给出关注建议。

要求：只基于给定材料推断，材料不足处明确标注；总长度 600 字以内。

领域材料：
{chr(10).join(doc_lines) or "（知识库暂无材料，请基于用户研究偏好给出通用领域图景框架）"}

用户研究偏好：
{mem_lines}"""

    report = chat("STRONG", [{"role": "user", "content": prompt}], temperature=0.5)
    return report, source_ids


def _collect_material(db: Session, user_id: int) -> tuple[list[str], list[int]]:
    doc_lines = []
    source_ids = []
    for d in db.query(Document).order_by(Document.created_at.desc()).limit(15):
        summary = (d.summary_cache or "").replace("<!--PREREAD-->", "")[:150]
        tag = "领域库" if d.project_id is None else "项目"
        doc_lines.append(f"- [id={d.id}|{tag}]《{d.title or d.file_name}》{summary}")
        source_ids.append(d.id)
    memories = (
        db.query(DomainMemory)
        .filter(DomainMemory.user_id == user_id, DomainMemory.status == "active")
        .order_by(DomainMemory.confidence.desc())
        .limit(6)
        .all()
    )
    mem_lines = [f"- {m.content}" for m in memories]
    return doc_lines + ["> 用户研究偏好："] + mem_lines, source_ids


def generate_landscape_graph(db: Session, user_id: int = 1) -> tuple[dict, list[int]]:
    materials, source_ids = _collect_material(db, user_id)
    prompt = f"""你是科研领域分析专家。基于以下材料与用户研究偏好，构建一份"研究图景思维导图"，输出严格的 JSON（不要 markdown 代码块、不要多余文字）。

材料：
{chr(10).join(materials) or "（暂无材料，请基于常识构建该领域的通用研究图景）"}

输出 JSON 结构：
{{
  "root": "领域总名称（短语）",
  "branches": [
    {{
      "label": "主要研究方向（短语）",
      "children": [
        {{
          "label": "子主题（短语）",
          "detail": "对该子方向研究进展的文字介绍，80-150 字，说明现状、代表工作与缺口",
          "related_doc_ids": [材料中与该子主题相关的文献 id，可为空数组],
          "is_gap": true 或 false（是否为值得切入的研究缺口）
        }}
      ]
    }}
  ]
}}

要求：
1. 主方向 3-5 个，每个主方向下 2-4 个子主题；
2. 至少标注 2 个 is_gap=true 的研究缺口节点；
3. related_doc_ids 只能使用材料中出现过的 id，无关则留空；
4. 只输出 JSON。"""
    raw = chat("STRONG", [{"role": "user", "content": prompt}], temperature=0.4, json_mode=True)
    import json as _json
    import re as _re

    m = _re.search(r"\{.*\}", raw, _re.S)
    graph = _json.loads(m.group(0)) if m else {"root": "研究图景", "branches": []}
    return graph, source_ids
