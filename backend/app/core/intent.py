import json
import re

from app.core.llm import chat

GLOBAL_KEYWORDS = (
    "综述", "脉络", "全景", "前沿", "热点", "领域概况", "研究现状",
    "整体", "总结", "图景", "landscape", "overview", "总结性",
    "有哪些方向", "目前进展", "总体",
)

MULTIHOP_PATTERNS = (
    r"和.{1,20}的关系",
    r"与.{1,20}的关系",
    r"如何影响",
    r"影响机制",
    r"传导",
    r"为什么",
    r"为何",
    r"对比",
    r"差异",
    r"之间",
    r"导致",
    r"演化",
    r"链条",
    r"跨.{1,12}(领域|学科|文献)",
    r"从.{1,15}到.{1,15}",
    r"基于.{1,15}推导",
    r"综合.{1,15}(文献|研究)",
)

_INTENT_CACHE: dict[str, dict] = {}


def classify_intent(query: str) -> dict:
    """返回 {"intent": fact|multi_hop|global, "source": rule|llm|default}"""
    q = query.strip()
    key = q[:200]
    if key in _INTENT_CACHE:
        cached = dict(_INTENT_CACHE[key])
        cached["source"] = "cache"
        return cached

    low = q.lower()
    if any(k.lower() in low for k in GLOBAL_KEYWORDS):
        result = {"intent": "global", "source": "rule"}
        _INTENT_CACHE[key] = result
        return result

    matched = sum(1 for pat in MULTIHOP_PATTERNS if re.search(pat, q))
    if matched >= 2:
        result = {"intent": "multi_hop", "source": "rule"}
        _INTENT_CACHE[key] = result
        return result

    if matched == 1 and len(q) > 10:
        llm_result = _llm_classify(q)
        if llm_result:
            _INTENT_CACHE[key] = llm_result
            return llm_result

    result = {"intent": "fact", "source": "rule" if matched == 0 else "default"}
    _INTENT_CACHE[key] = result
    return result


def _llm_classify(query: str) -> dict | None:
    prompt = f"""判断下列研究问题的检索意图类型，只输出 JSON：
- fact：查找某个具体事实/定义/结论（单跳可答）
- multi_hop：需要关联多篇文献/多个概念之间的关系、机制、演化（多跳推理）
- global：需要领域整体概览、综述性总结、研究现状全景

问题：{query[:500]}

输出格式：{{"intent": "fact|multi_hop|global"}}"""
    try:
        raw = chat(
            "LIGHT",
            [{"role": "user", "content": prompt}],
            temperature=0.0,
            json_mode=True,
            metric_prefix="[INTENT_CLASSIFIER]",
        )
        m = re.search(r"\{.*\}", raw, re.S)
        if not m:
            return None
        parsed = json.loads(m.group(0))
        intent = parsed.get("intent")
        if intent in ("fact", "multi_hop", "global"):
            return {"intent": intent, "source": "llm"}
        return None
    except Exception:
        return None
