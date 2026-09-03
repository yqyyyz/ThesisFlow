import re

import httpx

CROSSREF_API = "https://api.crossref.org"
SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1"


def normalize_doi(raw: str) -> str | None:
    raw = raw.strip()
    m = re.search(r"10\.\d{4,9}/[^\s\"'<>]+", raw)
    return m.group(0).rstrip(".,);") if m else None


async def resolve_doi(doi: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{CROSSREF_API}/works/{doi}",
                headers={"User-Agent": "ThesisFlow-Demo/0.1 (mailto:demo@thesisflow.local)"},
            )
            if resp.status_code != 200:
                return None
            msg = resp.json().get("message", {})
            title = (msg.get("title") or [""])[0]
            authors = [
                " ".join(filter(None, [a.get("given", ""), a.get("family", "")]))
                for a in msg.get("author", [])
            ]
            venue = (msg.get("container-title") or [None])[0]
            year = None
            for key in ("published-print", "published-online", "issued", "created"):
                parts = (msg.get(key) or {}).get("date-parts") or []
                if parts and parts[0] and parts[0][0]:
                    year = parts[0][0]
                    break
            cited_by = msg.get("is-referenced-by-count")
            if cited_by is None:
                try:
                    s2 = await client.get(
                        f"{SEMANTIC_SCHOLAR_API}/paper/DOI:{doi}",
                        params={"fields": "citationCount"},
                    )
                    if s2.status_code == 200:
                        cited_by = s2.json().get("citationCount")
                except Exception:
                    pass
            return {
                "doi": doi,
                "title": title or None,
                "authors": authors or None,
                "venue": venue,
                "year": year,
                "cited_by": cited_by,
            }
    except Exception:
        return None
