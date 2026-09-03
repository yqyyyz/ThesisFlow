import json
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.core.llm import chat, embed
from app.core.vectors import blob_to_vec, cosine_similarity
from app.models.drafting import Citation
from app.models.literature import Chunk

CITATION_RE = re.compile(r"\[(\d+):(\d+)\]")

BASE_INVALID = 0.50
BASE_PASS = 0.70
RISK_INVALID = 0.60
RISK_PASS = 0.80

HIGH_RISK_RE = re.compile(
    r"(\d+(\.\d+)?\s*%|p\s*[<>=]\s*0\.\d{1,3}|β|相关系数|导致|使得|因果|显著提升|显著降低|增长|下降)"
)


def nli_check(sentence: str, evidence: str) -> str:
    """返回 entail / contradict / neutral"""
    prompt = f"""判断证据与断言之间的逻辑关系（NLI）。

证据（原文片段）：
{evidence[:900]}

断言（写作中引用该证据的句子）：
{sentence[:300]}

判断标准：
- entail：断言的内容可以由证据支持（允许合理概括）
- contradict：断言与证据明显冲突
- neutral：证据与断言相关但不足以支持（信息缺失/过度引申）

只输出 JSON：{{"verdict": "entail|contradict|neutral", "reason": "20字以内"}}"""
    try:
        raw = chat(
            "LIGHT",
            [{"role": "user", "content": prompt}],
            temperature=0.0,
            json_mode=True,
            metric_prefix="[NLI_CHECK]",
        )
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            parsed = json.loads(m.group(0))
            verdict = parsed.get("verdict")
            if verdict in ("entail", "contradict", "neutral"):
                return verdict
    except Exception:
        pass
    return "neutral"


def verify_citations(
    db: Session, draft_id: int, generated_text: str, evidence_keys: list[str]
) -> list[dict]:
    results = []
    for m in CITATION_RE.finditer(generated_text):
        key = f"{m.group(1)}:{m.group(2)}"
        start = max(0, m.start() - 150)
        sentence = generated_text[start: m.end()]
        high_risk = bool(HIGH_RISK_RE.search(sentence))
        invalid_th, pass_th = (RISK_INVALID, RISK_PASS) if high_risk else (BASE_INVALID, BASE_PASS)

        if key not in evidence_keys:
            row = Citation(
                draft_id=draft_id,
                chunk_key=key,
                sentence_text=sentence,
                verify_score=0.0,
                status="invalid",
                verify_method="vector",
            )
            db.add(row)
            results.append(
                {"chunk_key": key, "status": "invalid", "score": 0.0, "method": "vector"}
            )
            continue

        chunk = db.query(Chunk).filter(Chunk.chunk_key == key).first()
        score = None
        if chunk and chunk.embedding:
            try:
                svec = embed([sentence])[0]
                score = cosine_similarity(svec, blob_to_vec(chunk.embedding))
            except Exception:
                score = None

        status = "normal"
        method = "vector"
        verdict = None
        if score is None:
            status = "weak"
        elif score < invalid_th:
            status = "invalid"
        elif score >= pass_th and not high_risk:
            status = "normal"
        else:
            verdict = nli_check(sentence, chunk.content if chunk else "")
            method = "nli"
            if verdict == "entail":
                status = "normal"
            elif verdict == "contradict":
                status = "invalid"
            else:
                status = "weak"

        row = Citation(
            draft_id=draft_id,
            chunk_key=key,
            sentence_text=sentence,
            verify_score=score,
            status=status,
            verify_method=method,
            nli_verdict=verdict,
        )
        db.add(row)
        results.append(
            {"chunk_key": key, "status": status, "score": score, "method": method}
        )
    db.commit()
    return results
