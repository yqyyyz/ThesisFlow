import json
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.llm import chat
from app.core.sse import sse_event, sse_response
from app.database import get_db
from app.models.literature import Annotation, Document, Project
from app.models.drafting import Draft, DraftSnapshot
from app.models.user import User, UserLog
from app.prompts.templates import (
    REVIEW_RUBRIC,
    drafting_chat_prompt,
    edit_action_prompt,
    review_check_prompt,
    review_fix_prompt,
    review_prompt_v2,
    writing_chat_prompt,
)
from app.schemas.writing import (
    ContinueRequest,
    DraftCreate,
    DraftOut,
    DraftUpdate,
    EditActionRequest,
    ReviewRequest,
    SnapshotOut,
)
from app.services.export import export_draft
from app.services.rag import format_context_block, retrieve, retrieve_for_intent
from app.services.writing import (
    build_system_prompt,
    continue_stream,
    verify_citations,
)

router = APIRouter(prefix="/api", tags=["writing"])

_PLACEHOLDER_RE = re.compile(
    r"\[doc_id:chunk_id\]|\[doc_id:chunk[^\]]*\]|\[NO_SUPPORT\]|\[文档id:块id\]",
    re.IGNORECASE,
)
_EN_CODE_RE = re.compile(
    r"[（(]\s*(?:claim_without_evidence|evidence_strength_mismatch|ignoring_counter_evidence|"
    r"misquotation|causal_gap|circular_reasoning|missing_transition|contradiction|"
    r"missing_section|unclear_contribution|abstract_mismatch|vague_language|terminology|"
    r"citation_format|operationalization|sample_description|robustness_gap)\s*[)）]"
)
_APPEND_NUM_RE = re.compile(
    r"^\s*(?:\d{1,2}(?:\.\d{1,2}){0,2}[\s、.．]|（[一二三四五六七八九十]{1,4}）|\([一二三四五六七八九十]{1,4}\))"
)


def _clean_placeholders(text: str) -> str:
    cleaned = _PLACEHOLDER_RE.sub("", text)
    cleaned = re.sub(r"（?此处证据不足[，。]?[^）]*）?", "", cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def _strip_append_numbering(content: str) -> str:
    if not content:
        return content
    lines = content.split("\n")
    first = lines[0].lstrip()
    m = _APPEND_NUM_RE.match(first)
    if m and len(first) < 60 and not re.search(r"[。；，：]$", first):
        lines[0] = first[m.end():].lstrip()
    return "\n".join(lines).strip()


def _anchor_occurrence(
    text: str, anchor: str, prefer_range: tuple[int, int] | None = None
) -> int | None:
    """返回锚点在全文中的出现序号（0 起）。若提供用户选中区间，优先取区间内的出现。"""
    if not anchor:
        return None
    matches = [i for i in range(len(text)) if text.startswith(anchor, i)]
    if not matches:
        return None
    if prefer_range:
        s, e = prefer_range
        for idx, pos in enumerate(matches):
            if pos >= s and pos + len(anchor) <= e:
                return idx
    return 0


def _clean_review_text(text: str) -> str:
    cleaned = _EN_CODE_RE.sub("", text)
    cleaned = _PLACEHOLDER_RE.sub("", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    cleaned = re.sub(r"^[（(][^）)]*[）)]\s*", "", cleaned)
    return cleaned


def _get_draft(db: Session, draft_id: int) -> Draft:
    draft = db.get(Draft, draft_id)
    if not draft:
        raise HTTPException(404, "草稿不存在")
    return draft


@router.post("/drafts", response_model=DraftOut)
def create_draft(payload: DraftCreate, db: Session = Depends(get_db)):
    project = db.get(Project, payload.project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    draft = Draft(
        project_id=payload.project_id,
        title=payload.title,
        content_json={"type": "doc", "content": []},
        outline_json=payload.outline,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    db.add(DraftSnapshot(draft_id=draft.id, content_json=draft.content_json, note="创建"))
    db.commit()
    return draft


@router.get("/projects/{project_id}/drafts", response_model=list[DraftOut])
def list_drafts(project_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Draft)
        .filter(Draft.project_id == project_id)
        .order_by(Draft.updated_at.desc())
        .all()
    )


@router.get("/drafts/{draft_id}", response_model=DraftOut)
def get_draft(draft_id: int, db: Session = Depends(get_db)):
    return _get_draft(db, draft_id)


@router.patch("/drafts/{draft_id}", response_model=DraftOut)
def update_draft(draft_id: int, payload: DraftUpdate, db: Session = Depends(get_db)):
    draft = _get_draft(db, draft_id)
    update = payload.model_dump(exclude_none=True)
    for field, value in update.items():
        setattr(draft, field, value)
    if payload.content_json is not None:
        import re

        def count_text(nodes):
            n = 0
            for node in nodes:
                if node.get("type") == "text":
                    n += len(node.get("text", ""))
                n += count_text(node.get("content", []))
            return n

        draft.word_count = count_text(payload.content_json.get("content", []))
        db.add(
            DraftSnapshot(
                draft_id=draft.id, content_json=draft.content_json, note="自动保存"
            )
        )
    db.commit()
    db.refresh(draft)
    return draft


@router.get("/drafts/{draft_id}/snapshots", response_model=list[SnapshotOut])
def list_snapshots(draft_id: int, db: Session = Depends(get_db)):
    _get_draft(db, draft_id)
    return (
        db.query(DraftSnapshot)
        .filter(DraftSnapshot.draft_id == draft_id)
        .order_by(DraftSnapshot.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/drafts/{draft_id}/snapshots/{snapshot_id}")
def get_snapshot(draft_id: int, snapshot_id: int, db: Session = Depends(get_db)):
    snap = db.get(DraftSnapshot, snapshot_id)
    if not snap or snap.draft_id != draft_id:
        raise HTTPException(404, "快照不存在")
    return {"id": snap.id, "content_json": snap.content_json, "note": snap.note,
            "created_at": snap.created_at}


@router.post("/drafts/{draft_id}/snapshots/{snapshot_id}:restore", response_model=DraftOut)
def restore_snapshot(draft_id: int, snapshot_id: int, db: Session = Depends(get_db)):
    draft = _get_draft(db, draft_id)
    snap = db.get(DraftSnapshot, snapshot_id)
    if not snap or snap.draft_id != draft_id:
        raise HTTPException(404, "快照不存在")
    db.add(
        DraftSnapshot(draft_id=draft.id, content_json=draft.content_json, note="回退前备份")
    )
    draft.content_json = snap.content_json
    db.commit()
    db.refresh(draft)
    return draft


@router.get("/drafts/{draft_id}/materials")
def list_materials(draft_id: int, db: Session = Depends(get_db)):
    draft = _get_draft(db, draft_id)
    anns = (
        db.query(Annotation)
        .join(Document, Annotation.doc_id == Document.id)
        .filter(Document.project_id == draft.project_id)
        .order_by(Annotation.created_at.desc())
        .limit(30)
        .all()
    )
    return [
        {
            "id": a.id,
            "kind": a.kind,
            "tag_label": a.tag_label,
            "text": a.text,
            "quote_text": a.quote_text,
            "chunk_key": a.chunk_key,
            "page_no": a.page_no,
        }
        for a in anns
    ]


@router.post("/drafts/{draft_id}/continue")
def continue_writing(draft_id: int, payload: ContinueRequest, db: Session = Depends(get_db)):
    draft = _get_draft(db, draft_id)
    project = db.get(Project, draft.project_id)

    retrieved = retrieve(
        db, draft.project_id, payload.surrounding_text or (payload.outline_path or "论文"),
        mode="writing",
    )
    evidence_block = format_context_block(retrieved)
    evidence_keys = [r["chunk_key"] for r in retrieved]

    selected_notes = ""
    if payload.selected_note_keys:
        notes = (
            db.query(Annotation)
            .filter(Annotation.chunk_key.in_(payload.selected_note_keys))
            .all()
        )
        lines = []
        for n in notes:
            content = n.quote_text or n.text or ""
            if content:
                lines.append(f"（{n.tag_label or n.kind}）{content}")
        selected_notes = "\n".join(lines)

    def gen():
        try:
            for kind, data in continue_stream(
                db,
                draft,
                payload.outline_path or "",
                payload.surrounding_text,
                payload.instruction,
                selected_notes,
                evidence_block,
                evidence_keys,
                payload.drafting_context,
            ):
                if kind == "done":
                    verify_results = verify_citations(
                        db, draft.id, data, evidence_keys
                    )
                    yield sse_event("verify_result", {
                        "citations": verify_results,
                        "retrieved": [
                            {"chunk_key": r["chunk_key"], "doc_id": r["doc_id"],
                             "doc_title": r["doc_title"], "page_no": r["page_no"]}
                            for r in retrieved
                        ],
                    })
                    yield sse_event("done", {"length": len(data)})
                elif kind == "citation":
                    yield sse_event("citation", {"chunk_key": data})
                else:
                    yield sse_event("token", {"text": data})
        except Exception as e:
            yield sse_event("error", {"message": str(e)[:300]})

    return sse_response(gen())


@router.post("/drafts/{draft_id}/edit-action")
def edit_action(draft_id: int, payload: EditActionRequest, db: Session = Depends(get_db)):
    _get_draft(db, draft_id)
    if payload.action not in ("polish", "rewrite", "logic"):
        raise HTTPException(422, "action 必须为 polish / rewrite / logic")
    system = build_system_prompt(db, 1)
    user_prompt = edit_action_prompt(payload.action, payload.selection, payload.extra_instruction)
    result = chat(
        "STRONG",
        [{"role": "system", "content": system}, {"role": "user", "content": user_prompt}],
        temperature=0.4,
    )
    return {"action": payload.action, "result": result}


@router.post("/drafts/{draft_id}/review")
def review(draft_id: int, payload: ReviewRequest, db: Session = Depends(get_db)):
    draft = _get_draft(db, draft_id)
    if payload.text:
        text = payload.text
    else:
        from app.services.export import _plain_text

        text = _plain_text(draft.content_json)
    if not text.strip():
        raise HTTPException(422, "无内容可审查")
    system = "你是一位严格的同行评审专家。"
    result = chat(
        "STRONG",
        [
            {"role": "system", "content": system},
            {"role": "user", "content": review_prompt_v2(text[:8000])},
        ],
        temperature=0.3,
        json_mode=True,
    )
    import re as _re

    m = _re.search(r"\[.*\]", result, _re.S)
    try:
        cards = json.loads(m.group(0)) if m else []
    except json.JSONDecodeError:
        cards = []
    if not isinstance(cards, list):
        cards = []
    for c in cards:
        if not isinstance(c, dict):
            continue
        for f in ("issue", "suggestion", "indicator"):
            if isinstance(c.get(f), str):
                c[f] = _clean_review_text(c[f])
        if isinstance(c.get("anchor_text"), str):
            c["anchor_occurrence"] = _anchor_occurrence(text, c["anchor_text"])
    return {"cards": cards, "rubric": REVIEW_RUBRIC}


@router.get("/review/rubric")
def review_rubric():
    return REVIEW_RUBRIC


def _get_chat_session(db: Session, project_id: int, mode: str = "drafting"):
    from app.models.drafting import ChatMessage, ChatSession

    session = (
        db.query(ChatSession)
        .filter(ChatSession.project_id == project_id, ChatSession.mode == mode)
        .order_by(ChatSession.created_at.desc())
        .first()
    )
    if not session:
        session = ChatSession(project_id=project_id, mode=mode,
                              title="起草商讨" if mode == "drafting" else "写作助手")
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


@router.get("/projects/{project_id}/drafting-history")
def drafting_history(project_id: int, mode: str = "drafting", db: Session = Depends(get_db)):
    from app.models.drafting import ChatMessage

    if mode not in ("drafting", "writing"):
        raise HTTPException(422, "mode 必须为 drafting / writing")
    session = _get_chat_session(db, project_id, mode)
    msgs = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    return {"history": [{"role": m.role, "content": m.content} for m in msgs]}


@router.post("/projects/{project_id}/drafting-chat")
def drafting_chat(project_id: int, payload: dict, db: Session = Depends(get_db)):
    from app.models.drafting import ChatMessage

    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    summaries = []
    for d in db.query(Document).filter(Document.project_id == project_id).limit(12):
        if d.scores:
            summaries.append(
                f"- 《{d.title}》四维总分 {sum(v['score'] for v in d.scores.values())/4:.1f}："
                f"{(d.summary_cache or '')[:150]}"
            )
    history = payload.get("history", [])[-10:]
    messages = [
        {"role": "system", "content": build_system_prompt(db, 1)},
        {
            "role": "user",
            "content": drafting_chat_prompt(
                project.research_question or "", "\n".join(summaries)
            ),
        },
    ]
    messages.extend({"role": h["role"], "content": h["content"]} for h in history)
    messages.append({"role": "user", "content": payload.get("message", "")})
    reply = chat("STRONG", messages, temperature=0.6)

    session = _get_chat_session(db, project_id)
    db.add(ChatMessage(session_id=session.id, role="user",
                       content=payload.get("message", "")[:4000]))
    db.add(ChatMessage(session_id=session.id, role="assistant", content=reply[:8000]))
    db.commit()

    user_turns = sum(1 for h in history if h.get("role") == "user") + 1
    if user_turns > 0 and user_turns % 4 == 0:
        conversation = "\n".join(
            f"{h.get('role', 'user')}: {h.get('content', '')}" for h in history[-8:]
        ) + f"\nuser: {payload.get('message', '')}\nassistant: {reply}"
        try:
            from app.services.memory import extract_candidates, integrate_memories

            candidates = extract_candidates(conversation)
            if candidates:
                integrate_memories(db, candidates, source_ref=f"project:{project_id}")
        except Exception:
            pass

    return {"reply": reply}


@router.post("/projects/{project_id}/drafting-outline")
def drafting_outline(project_id: int, payload: dict, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    history = payload.get("history", [])
    if not history:
        raise HTTPException(422, "暂无商讨内容，请先在起草模式与 AI 讨论")
    conversation = "\n".join(
        f"{h.get('role', 'user')}: {h.get('content', '')}" for h in history[-16:]
    )[:12000]
    prompt = f"""基于以下起草商讨对话与研究问题，提炼一份结构化的论文大纲。
研究问题：{project.research_question or "（未设定）"}

商讨对话：
{conversation}

请直接用 Markdown 格式输出大纲（不要代码块、不要任何前后缀文字）：
- 用 # 表示一级章节标题，## 表示二级小节
- 每个章节下用 - 列出 2-4 个要点
- 4-7 个章节，要点紧扣商讨中达成的共识"""
    raw = chat("STRONG", [{"role": "user", "content": prompt}], temperature=0.3)
    md = raw.strip().strip("`").strip()
    if md.startswith("markdown"):
        md = md[len("markdown"):].strip()
    return {"outline_md": md}


@router.post("/drafts/{draft_id}/writing-chat")
def writing_chat(draft_id: int, payload: dict, db: Session = Depends(get_db)):
    from app.models.drafting import ChatMessage

    draft = _get_draft(db, draft_id)
    message = str(payload.get("message", "")).strip()
    if not message:
        raise HTTPException(422, "message 不能为空")
    history = payload.get("history", [])[-8:]
    selection = str(payload.get("selection", "") or "")[:2000]
    drafting_context = str(payload.get("drafting_context", "") or "")[:2500]

    from app.services.export import _plain_text
    from app.services.writing import build_system_prompt

    editor_text = _plain_text(draft.content_json)

    from app.core.intent import classify_intent

    intent_info = classify_intent(message)
    routed = retrieve_for_intent(
        db,
        draft.project_id,
        (message + " " + selection)[:1000] or "论文写作",
        intent_info["intent"],
        mode="writing",
    )
    retrieved = routed["chunks"]
    db.add(
        UserLog(
            event_type="route_decision",
            detail={
                "draft_id": draft.id,
                "intent": intent_info["intent"],
                "intent_source": intent_info["source"],
                "route": routed["route"],
                "clusters_used": routed["clusters_used"],
            },
        )
    )
    db.commit()
    if payload.get("selected_note_keys"):
        notes = (
            db.query(Annotation)
            .filter(Annotation.chunk_key.in_(payload["selected_note_keys"]))
            .all()
        )
        for n in notes:
            content = n.quote_text or n.text or ""
            if content and not any(r["chunk_key"] == n.chunk_key for r in retrieved):
                retrieved.insert(
                    0,
                    {
                        "chunk_key": n.chunk_key or "",
                        "doc_id": 0,
                        "doc_title": "精读素材",
                        "section_title": n.tag_label or "",
                        "page_no": n.page_no,
                        "tier": 2,
                        "content": content[:1200],
                    },
                )
    retrieved = retrieved[:10]
    evidence_block = format_context_block(retrieved)
    evidence_keys = [r["chunk_key"] for r in retrieved]

    user = db.get(User, 1)
    citation_style = user.citation_style if user else "APA"
    outline_path = ""
    if draft.outline_json and isinstance(draft.outline_json, dict):
        md = draft.outline_json.get("markdown", "")
        if md:
            heading_lines = [
                ln.strip("# ").strip()
                for ln in md.split("\n")
                if ln.strip().startswith("#")
            ]
            outline_path = " / ".join(heading_lines[:6])
        else:
            secs = draft.outline_json.get("sections", [])
            outline_path = " / ".join(str(s) for s in secs[:6])

    prompt = writing_chat_prompt(
        editor_text,
        selection,
        outline_path,
        drafting_context,
        "",
        evidence_block,
        message,
        citation_style,
    )
    system_prompt = build_system_prompt(db, 1)
    messages = [{"role": "system", "content": system_prompt}]
    for h in history:
        r = h.get("role", "user")
        messages.append(
            {"role": "user" if r == "user" else "assistant",
             "content": str(h.get("content", ""))[:3000]}
        )
    messages.append({"role": "user", "content": prompt})

    raw = chat(
        "STRONG",
        messages,
        temperature=0.4,
        json_mode=True,
        metric_prefix=system_prompt,
    )
    import re as _re

    m = _re.search(r"\{.*\}", raw, _re.S)
    proposal = None
    try:
        proposal = json.loads(m.group(0)) if m else None
    except json.JSONDecodeError:
        proposal = None
    if not isinstance(proposal, dict):
        proposal = {"type": "reply", "content": raw}
    if proposal.get("type") not in ("reply", "append", "replace", "delete"):
        proposal = {"type": "reply", "content": raw}

    ptype = proposal["type"]
    if isinstance(proposal.get("content"), str) and ptype in ("append", "replace"):
        content = _clean_placeholders(proposal["content"])
        if ptype == "append":
            content = _strip_append_numbering(content)
        proposal["content"] = content
    if ptype in ("append", "replace", "delete") and proposal.get("anchor_text"):
        anchor = str(proposal["anchor_text"])
        prefer = None
        if selection:
            sel_start = editor_text.find(selection.strip())
            if sel_start != -1:
                prefer = (sel_start, sel_start + len(selection.strip()))
        proposal["anchor_occurrence"] = _anchor_occurrence(editor_text, anchor, prefer)

    verify = []
    if ptype in ("append", "replace") and proposal.get("content"):
        verify = verify_citations(db, draft.id, proposal["content"], evidence_keys)

    session = _get_chat_session(db, draft.project_id, "writing")
    db.add(ChatMessage(session_id=session.id, role="user", content=message[:4000]))
    db.add(
        ChatMessage(
            session_id=session.id,
            role="assistant",
            content=json.dumps(proposal, ensure_ascii=False)[:8000],
        )
    )
    db.commit()

    return {
        "proposal_type": ptype,
        "proposal": proposal,
        "verify": verify,
        "evidence": [
            {"chunk_key": r["chunk_key"], "doc_title": r["doc_title"],
             "page_no": r["page_no"]}
            for r in retrieved
        ],
    }


@router.post("/drafts/{draft_id}/review-apply")
def review_apply(draft_id: int, payload: dict, db: Session = Depends(get_db)):
    import re as _re

    _get_draft(db, draft_id)
    items = payload.get("items", [])
    if not isinstance(items, list) or len(items) == 0:
        raise HTTPException(422, "items 不能为空")
    if len(items) > 10:
        raise HTTPException(422, "单次最多处理 10 条建议")

    citation_re = _re.compile(r"\[\d+:\d+\]")
    results = []
    for item in items:
        anchor = str(item.get("anchor_text", "")).strip()
        current_text = str(item.get("current_text", "") or "").strip()
        issue = str(item.get("issue", ""))[:300]
        suggestion = str(item.get("suggestion", ""))[:300]
        if not anchor or not issue:
            continue
        base = current_text or anchor
        fixed = chat(
            "STRONG",
            [{"role": "user", "content": review_fix_prompt(base, issue, suggestion)}],
            temperature=0.3,
        ).strip()
        fixed = _clean_placeholders(fixed)
        fixed = _strip_append_numbering(fixed)
        orig_marks = set(citation_re.findall(base))
        fixed_marks = set(citation_re.findall(fixed))
        citation_intact = orig_marks.issubset(fixed_marks)
        check = {"passed": False, "reason": "校验失败"}
        try:
            raw = chat(
                "LIGHT",
                [{"role": "user", "content": review_check_prompt(base, fixed, issue)}],
                temperature=0.1,
                json_mode=True,
            )
            m = _re.search(r"\{.*\}", raw, _re.S)
            if m:
                check = json.loads(m.group(0))
        except Exception:
            pass
        results.append(
            {
                "anchor_text": base,
                "fixed": fixed,
                "citation_intact": citation_intact,
                "check": check,
            }
        )
    return {"results": results}


@router.post("/drafts/{draft_id}/feedback")
def feedback(draft_id: int, payload: dict, db: Session = Depends(get_db)):
    from app.models.drafting import AiFeedback

    _get_draft(db, draft_id)
    action = payload.get("action")
    if action not in ("accept", "reject", "edit"):
        raise HTTPException(422, "action 必须为 accept / reject / edit")
    db.add(
        AiFeedback(
            draft_id=draft_id,
            action=action,
            content_ref=(payload.get("content_ref") or "")[:2000],
            diff_summary=payload.get("diff_summary"),
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/drafts/{draft_id}/export")
def export(draft_id: int, payload: dict, db: Session = Depends(get_db)):
    draft = _get_draft(db, draft_id)
    fmt = payload.get("format", "docx")
    if fmt not in ("docx", "tex", "pdf", "md"):
        raise HTTPException(422, "format 必须为 docx / tex / pdf / md")
    try:
        path = export_draft(db, draft, fmt)
    except Exception as e:
        raise HTTPException(500, f"导出失败：{e}") from e
    db.add(
        UserLog(
            event_type="export", detail={"draft_id": draft_id, "format": fmt}
        )
    )
    db.commit()
    return FileResponse(
        path,
        filename=path.name,
        media_type={
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "tex": "application/x-tex",
            "pdf": "application/pdf",
            "md": "text/markdown",
        }[fmt],
    )
