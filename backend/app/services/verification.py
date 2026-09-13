import json
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.core.llm import chat, embed
from app.core.vectors import blob_to_vec, cosine_similarity
from app.models.drafting import Citation
from app.models.literature import Chunk, Document

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
            trace={
                "stage": "citation_nli_verification",
                "prompt_template_id": "verification.nli",
                "prompt_template_source": "app.services.verification.nli_check",
                "context_manifest": {
                    "claim_chars": len(sentence),
                    "evidence_chars": min(len(evidence), 900),
                },
            },
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
        cited_doc_id = int(m.group(1))
        start = max(0, m.start() - 150)
        sentence = generated_text[start: m.end()]
        high_risk = bool(HIGH_RISK_RE.search(sentence))
        invalid_th, pass_th = (RISK_INVALID, RISK_PASS) if high_risk else (BASE_INVALID, BASE_PASS)

        document_exists = db.get(Document, cited_doc_id) is not None
        chunk = db.query(Chunk).filter(Chunk.chunk_key == key).first()
        source_status = "exists" if document_exists else "missing"
        location_status = (
            "located"
            if chunk and chunk.doc_id == cited_doc_id
            else "mismatch" if chunk else "missing"
        )
        in_evidence = key in evidence_keys

        if not document_exists or location_status != "located" or not in_evidence:
            reason = (
                "来源不存在"
                if not document_exists
                else "引用片段无法定位"
                if location_status != "located"
                else "引用未包含在本次证据列表中"
            )
            row = Citation(
                draft_id=draft_id,
                chunk_key=key,
                sentence_text=sentence,
                verify_score=0.0,
                status="invalid",
                verify_method="structural",
            )
            db.add(row)
            results.append(
                {
                    "chunk_key": key,
                    "status": "invalid",
                    "score": 0.0,
                    "method": "structural",
                    "source_status": source_status,
                    "location_status": location_status,
                    "support_status": "not_checked",
                    "reason": reason,
                }
            )
            continue

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
        support_status = {
            "normal": "supported",
            "weak": "uncertain",
            "invalid": "contradicted" if verdict == "contradict" else "unsupported",
        }[status]
        reason = {
            "supported": "证据支持当前主张",
            "uncertain": "证据与主张相关，但支持力度不足",
            "contradicted": "证据与当前主张冲突",
            "unsupported": "证据不足以支持当前主张",
        }[support_status]
        results.append(
            {
                "chunk_key": key,
                "status": status,
                "score": score,
                "method": method,
                "source_status": source_status,
                "location_status": location_status,
                "support_status": support_status,
                "reason": reason,
            }
        )
    db.commit()
    return results
