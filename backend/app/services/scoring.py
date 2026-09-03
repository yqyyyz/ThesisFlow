import json
import re

from app.core.llm import chat

BUILTIN_DIMENSIONS = [
    {"key": "quality", "name": "质量", "desc": "期刊/会议等级、被引量、写作规范性"},
    {"key": "relevance", "name": "相关性", "desc": "与当前项目研究问题的语义匹配度"},
    {"key": "methodology", "name": "方法论严谨度", "desc": "实验设计完整性、样本量、统计方法合理性"},
    {"key": "novelty", "name": "创新性", "desc": "是否提出新理论/新方法/新数据集"},
]
BUILTIN_KEYS = [d["key"] for d in BUILTIN_DIMENSIONS]

DISCIPLINE_ANCHORS = {
    "economics": (
        "学科锚点（经济学）：方法论重点关注识别策略（DID/RDD/IV/PSM 等）、"
        "样本量与数据代表性、稳健性检验完备性；质量关注期刊等级（Top5/核心）与被引量；"
        "相关性关注是否直接回应研究问题的因果机制。"
    ),
    "computer_science": (
        "学科锚点（计算机科学）：方法论重点关注基准数据集完备性、消融实验、"
        "可复现性与复杂度分析；质量关注顶会（NeurIPS/ICML/ACL 等）与被引量；"
        "创新性关注是否提出新模型/新任务/新数据集。"
    ),
    "default": (
        "学科锚点（通用）：方法论关注研究设计与证据链完整性；"
        "质量关注发表载体与被引量；创新性关注新理论/新方法/新数据。"
    ),
}


def pick_anchor(discipline: str) -> str:
    low = (discipline or "").lower()
    if any(k in low for k in ("经济", "econ", "金融", "管理", "商")):
        return DISCIPLINE_ANCHORS["economics"]
    if any(k in low for k in ("计算机", "computer", "信息", "人工智能", "nlp", "cs")):
        return DISCIPLINE_ANCHORS["computer_science"]
    return DISCIPLINE_ANCHORS["default"]


def all_dimensions(project) -> list[dict]:
    dims = list(BUILTIN_DIMENSIONS)
    profile = project.discipline_profile if project else None
    if profile and profile.get("custom_dims"):
        for cd in profile["custom_dims"]:
            dims.append(
                {
                    "key": cd["key"],
                    "name": cd.get("name", cd["key"]),
                    "desc": cd.get("desc", "用户自定义维度"),
                }
            )
    return dims


def dimension_weights(project) -> dict[str, float]:
    weights = {d["key"]: 0.25 for d in BUILTIN_DIMENSIONS}
    profile = project.discipline_profile if project else None
    if not profile:
        return weights
    if profile.get("score_weights"):
        for k, v in profile["score_weights"].items():
            weights[k] = float(v)
    if profile.get("custom_dims"):
        for cd in profile["custom_dims"]:
            weights[cd["key"]] = float(cd.get("weight", 0.25))
    return weights


def _extract_json(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _coerce_score(value) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        return 3
    return max(1, min(5, score))


def load_calibration_samples(db, user_id: int, limit: int = 6) -> list[dict]:
    """取该用户最近的人工评分校正记录，作为后续打分的 few-shot 校准样例。"""
    from sqlalchemy.orm import Session

    from app.models.literature import ScoreFeedback

    rows = (
        db.query(ScoreFeedback)
        .filter(ScoreFeedback.user_id == user_id)
        .order_by(ScoreFeedback.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "dim": r.dim,
            "model_score": r.model_score,
            "user_score": r.user_score,
            "reason": (r.reason or "")[:60],
        }
        for r in reversed(rows)
    ]


def _calibration_block(samples: list[dict] | None) -> str:
    if not samples:
        return ""
    lines = []
    for s in samples:
        if s["model_score"] is None:
            lines.append(
                f"- {s['dim']}：人工评定 {s['user_score']} 分，理由：{s['reason'] or '（无）'}"
            )
        else:
            lines.append(
                f"- {s['dim']}：模型曾评 {s['model_score']} 分，人工校正为 {s['user_score']} 分，理由：{s['reason'] or '（无）'}"
            )
    return (
        "\n\n人工评分校正样例（来自本研究者此前的校正记录，请据此校准你的评分尺度，"
        "避免重复出现同类偏差）：\n" + "\n".join(lines)
    )


def score_document(
    doc_meta: str,
    abstract: str,
    conclusion: str,
    research_question: str,
    dimensions: list[dict] | None = None,
    calibration: list[dict] | None = None,
) -> dict:
    dims = dimensions or BUILTIN_DIMENSIONS
    dim_lines = "\n".join(f"- {d['key']}（{d['name']}）：{d['desc']}" for d in dims)
    json_shape = ", ".join(
        f'"{d["key"]}": {{"score": 0, "reason": ""}}' for d in dims
    )
    prompt = f"""请依据以下文献信息，从给定维度对该文献进行 1-5 分的整数打分，并给出每个维度的简要理由（每条不超过 40 字）。

评分维度：
{dim_lines}

当前项目研究问题：
{research_question or "（未设定，按通用学术价值评估）"}

文献元数据：
{doc_meta}

文献摘要：
{abstract or "（缺失）"}

文献结论片段：
{conclusion or "（缺失）"}
{_calibration_block(calibration)}

只输出一个 JSON 对象，不要输出其他内容，格式如下：
{{{json_shape}}}"""
    raw = chat("LIGHT", [{"role": "user", "content": prompt}], temperature=0.1, json_mode=True)
    parsed = _extract_json(raw) or {}
    result = {}
    for d in dims:
        item = parsed.get(d["key"]) or {}
        if isinstance(item, dict):
            result[d["key"]] = {
                "score": _coerce_score(item.get("score")),
                "reason": str(item.get("reason", ""))[:200],
            }
        else:
            result[d["key"]] = {"score": _coerce_score(item), "reason": ""}
    return result


def weighted_total(scores: dict, weights: dict | None = None) -> float:
    weights = weights or {}
    keys = [k for k in scores.keys()]
    if not keys:
        return 0.0
    total_w = sum(weights.get(k, 0.25) for k in keys) or 1.0
    acc = 0.0
    for k in keys:
        acc += scores[k]["score"] * weights.get(k, 0.25)
    return round(acc / total_w, 3)
