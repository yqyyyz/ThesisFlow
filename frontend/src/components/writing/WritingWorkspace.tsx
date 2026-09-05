"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import EditorPanel from "./EditorPanel";
import {
  renderCitationLabels,
  useCitationMetaStore,
} from "@/stores/citationMeta";

type Mode = "drafting" | "writing" | "review";

interface DraftInfo {
  id: number;
  title: string;
  content_json: Record<string, unknown> | null;
  outline_json: Record<string, unknown> | null;
}

interface Material {
  id: number;
  kind: string;
  tag_label: string | null;
  text: string | null;
  quote_text: string | null;
  chunk_key: string | null;
}

interface ReviewCard {
  dimension: string;
  indicator?: string;
  anchor_text: string;
  anchor_occurrence?: number;
  issue: string;
  suggestion: string;
  severity: string;
  fix_effort?: string;
}

interface RubricInfo {
  dimensions: { key: string; name: string; indicators: string[] }[];
  severity_anchors: Record<string, string>;
}

interface Snapshot {
  id: number;
  note: string | null;
  created_at: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface ProposalVerify {
  chunk_key: string;
  status: string;
  score: number | null;
}

interface WritingMsg {
  role: "user" | "assistant";
  content: string;
  proposal?: {
    type: "reply" | "append" | "replace" | "delete";
    content?: string;
    anchor_text?: string;
    anchor_occurrence?: number;
    reason?: string;
  };
  verify?: ProposalVerify[];
  status?: "applied" | "rejected";
}

const DIMENSION_LABELS: Record<string, string> = {
  evidence: "论证充分性",
  logic: "逻辑连贯性",
  structure: "结构完整性",
  academic_norm: "学术规范性",
  methodology: "方法严谨性",
};
const DIMENSION_ORDER = ["evidence", "logic", "structure", "academic_norm", "methodology"];
const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-neutral-100 text-neutral-500",
};
const SEVERITY_LABELS: Record<string, string> = {
  high: "必须修改",
  medium: "应当修改",
  low: "可选润色",
};

export default function WritingWorkspace({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<Mode>("writing");
  const [draft, setDraft] = useState<DraftInfo | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<number>>(new Set());
  const [genStatus, setGenStatus] = useState<string>("");
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<number | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [writingMessages, setWritingMessages] = useState<WritingMsg[]>([]);
  const [writingInput, setWritingInput] = useState("");
  const [writingLoading, setWritingLoading] = useState(false);

  const [reviewCards, setReviewCards] = useState<ReviewCard[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rubric, setRubric] = useState<RubricInfo | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [showRubric, setShowRubric] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [resolvedCards, setResolvedCards] = useState<Set<number>>(new Set());
  const [fixLoading, setFixLoading] = useState(false);
  const [fixResults, setFixResults] = useState<
    {
      anchor_text: string;
      fixed: string;
      citation_intact: boolean;
      check: { passed: boolean; reason: string };
      issue?: string;
      suggestion?: string;
      applied?: boolean;
      discarded?: boolean;
      conflict?: boolean;
      cardIndex?: number;
    }[]
  >([]);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [outlineText, setOutlineText] = useState("");
  const [outlinePreview, setOutlinePreview] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const citationMeta = useCitationMetaStore((s) => s.byDoc);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    (async () => {
      try {
        const drafts = await api<DraftInfo[]>(`/api/projects/${projectId}/drafts`);
        let d: DraftInfo;
        if (drafts.length > 0) {
          d = drafts[0];
        } else {
          d = await api<DraftInfo>("/api/drafts", {
            method: "POST",
            body: JSON.stringify({ project_id: Number(projectId), title: "未命名草稿" }),
          });
        }
        setDraft(d);
        setEditorReady(true);
        setOutlineText(
          ((d.outline_json as { sections?: string[] })?.sections || []).join("\n")
        );
      } catch (e) {
        showToast((e as Error).message);
      }
      api<Material[]>(`/api/drafts/0/materials`).catch(() => {});
    })();
  }, [projectId]);

  useEffect(() => {
    if (!draft) return;
    api<Material[]>(`/api/drafts/${draft.id}/materials`)
      .then(setMaterials)
      .catch(() => {});
    api<Snapshot[]>(`/api/drafts/${draft.id}/snapshots`)
      .then(setSnapshots)
      .catch(() => {});
    api<{ history: ChatMsg[] }>(`/api/projects/${projectId}/drafting-history`)
      .then((d) => setChatMessages(d.history))
      .catch(() => {});
    api<{ history: { role: string; content: string }[] }>(
      `/api/projects/${projectId}/drafting-history?mode=writing`
    )
      .then((d) => {
        const msgs: WritingMsg[] = d.history.map((h) => {
          if (h.role === "assistant") {
            try {
              const p = JSON.parse(h.content);
              if (p && typeof p === "object" && p.type) {
                return {
                  role: "assistant" as const,
                  content: p.type === "reply" ? p.content || "" : "",
                  proposal: p,
                };
              }
            } catch {
              /* 普通文本 */
            }
          }
          return { role: h.role as "user" | "assistant", content: h.content };
        });
        setWritingMessages(msgs);
      })
      .catch(() => {});
  }, [draft?.id, projectId]);

  useEffect(() => {
    api<{
      documents: {
        id: number;
        authors?: string[] | null;
        year?: number | null;
        title?: string | null;
      }[];
    }>(`/api/projects/${projectId}/documents?view=list`)
      .then((d) => useCitationMetaStore.getState().setDocs(d.documents))
      .catch(() => {});
  }, [projectId]);

  const saveContent = useCallback(
    (json: Record<string, unknown>) => {
      if (!draft || saveTimer.current) return;
      saveTimer.current = window.setTimeout(async () => {
        saveTimer.current = null;
        try {
          const updated = await api<DraftInfo>(`/api/drafts/${draft.id}`, {
            method: "PATCH",
            body: JSON.stringify({ content_json: json }),
          });
          api<Snapshot[]>(`/api/drafts/${draft.id}/snapshots`)
            .then(setSnapshots)
            .catch(() => {});
        } catch {
          /* ignore */
        }
      }, 1500);
    },
    [draft]
  );

  const draftingSummary = (): string =>
    chatMessages.length
      ? chatMessages
          .slice(-8)
          .map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`)
          .join("\n")
          .slice(0, 2500)
      : "";

  const findAnchorRange = (
    ed: NonNullable<typeof editorRef.current>,
    anchor: string,
    occurrence?: number
  ): {
    hit: { from: number; to: number } | null;
    matches: number;
    ambiguous: boolean;
    matchedText: string;
  } => {
    const positions: number[] = [];
    let text = "";
    ed.state.doc.descendants((node, pos) => {
      if (node.isText) {
        const len = node.text?.length || 0;
        for (let i = 0; i < len; i++) positions.push(pos + i);
        text += node.text;
      } else if (node.type.name === "citation") {
        const docId =
          node.attrs?.docId ??
          String(node.attrs?.chunkKey ?? "").split(":")[0] ??
          "";
        const seq =
          node.attrs?.chunkSeq ??
          String(node.attrs?.chunkKey ?? "").split(":")[1] ??
          "";
        const markText = `[${docId}:${seq}]`;
        for (let i = 0; i < markText.length; i++) positions.push(i === 0 ? pos : -1);
        text += markText;
      } else if (node.type.name === "paragraph" || node.type.name.startsWith("heading")) {
        positions.push(-1);
        text += "\n";
      }
      return true;
    });

    const findAll = (haystack: string, needle: string) => {
      const out: { start: number; end: number }[] = [];
      let from = 0;
      while (true) {
        const i = haystack.indexOf(needle, from);
        if (i === -1) break;
        out.push({ start: i, end: i + needle.length });
        from = i + 1;
      }
      return out;
    };

    const normMap: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (!/\s/.test(text[i])) normMap.push(i);
    }

    let hits = findAll(text, anchor);
    if (hits.length === 0) {
      const normAnchor = anchor.replace(/\s+/g, "");
      const normText = text.replace(/\s+/g, "");
      const normHits = findAll(normText, normAnchor);
      hits = normHits.map((h) => {
        const start = normMap[h.start] ?? h.start;
        const end = (normMap[h.end - 1] ?? h.end - 1) + 1;
        return { start, end };
      });
    }

    let pick: { start: number; end: number } | null = null;
    if (hits.length > 0) {
      if (occurrence !== undefined && occurrence >= 0 && occurrence < hits.length) {
        pick = hits[occurrence];
      } else if (hits.length === 1) {
        pick = hits[0];
      } else {
        return { hit: null, matches: hits.length, ambiguous: true, matchedText: "" };
      }
    } else if (anchor.length > 20) {
      const prefix = anchor.slice(0, 20);
      const pHits = findAll(text, prefix);
      if (pHits.length === 1) pick = pHits[0];
      else if (pHits.length > 1)
        return { hit: null, matches: pHits.length, ambiguous: true, matchedText: "" };
    }
    if (!pick)
      return { hit: null, matches: hits.length, ambiguous: false, matchedText: "" };

    let from = -1;
    for (let i = pick.start; i < positions.length; i++) {
      if (positions[i] !== -1) {
        from = positions[i];
        break;
      }
    }
    let to = -1;
    for (let i = Math.min(pick.end - 1, positions.length - 1); i >= 0; i--) {
      if (positions[i] !== -1) {
        to = positions[i] + 1;
        break;
      }
    }
    return {
      hit: from >= 0 && to > from ? { from, to } : null,
      matches: hits.length,
      ambiguous: false,
      matchedText: text.substring(pick.start, pick.end),
    };
  };

  const parseContentToNodes = (content: string) => {
    const blocks = content
      .split(/\n+/)
      .map((b) => b.trim())
      .filter(Boolean);
    return blocks.map((block) => {
      const parts = block.split(/(\[\d+:\d+\])/g).filter(Boolean);
      const inline: ({ type: string; text: string } | { type: string; attrs: object })[] = [];
      for (const p of parts) {
        const m = p.match(/^\[(\d+):(\d+)\]$/);
        if (m) {
          inline.push({
            type: "citation",
            attrs: {
              chunkKey: `${m[1]}:${m[2]}`,
              docId: Number(m[1]),
              chunkSeq: Number(m[2]),
              status: "normal",
            },
          });
        } else if (p.length > 0) {
          inline.push({ type: "text", text: p });
        }
      }
      return { type: "paragraph", content: inline };
    });
  };

  const applyContentChange = (
    ed: NonNullable<typeof editorRef.current>,
    change: {
      type: string;
      anchor_text?: string;
      anchor_occurrence?: number;
      content?: string;
    }
  ): { ok: boolean; message: string } => {
    try {
      if (change.type === "append" && change.content) {
        const nodes = parseContentToNodes(change.content);
        if (nodes.length === 0) return { ok: false, message: "提案内容为空" };
        let insertAt = ed.state.doc.content.size;
        if (change.anchor_text) {
          const { hit, matches, ambiguous } = findAnchorRange(
            ed,
            change.anchor_text,
            change.anchor_occurrence
          );
          if (!hit) {
            if (ambiguous) {
              return {
                ok: false,
                message: `插入位置的锚点在文稿中出现 ${matches} 处，无法确定目标段落，请人工核对`,
              };
            }
            return {
              ok: false,
              message: "未能在编辑器中定位插入位置的锚点段落，请重新生成提案",
            };
          }
          const $pos = ed.state.doc.resolve(hit.to);
          let depth = $pos.depth;
          while (depth > 0 && !$pos.node(depth).isTextblock) depth--;
          insertAt =
            depth > 0 ? $pos.before(depth) + $pos.node(depth).nodeSize : ed.state.doc.content.size;
        }
        const beforeLen = ed.getText().length;
        ed.commands.insertContentAt(insertAt, nodes as never);
        if (ed.getText().length <= beforeLen) {
          return { ok: false, message: "写入未生效，请重试" };
        }
        return {
          ok: true,
          message: change.anchor_text ? "已追加到指定段落之后" : "已追加到文稿末尾",
        };
      }
      if ((change.type === "replace" || change.type === "delete") && change.anchor_text) {
        const { hit, matches, ambiguous, matchedText } = findAnchorRange(
          ed,
          change.anchor_text,
          change.anchor_occurrence
        );
        if (!hit) {
          if (ambiguous) {
            return {
              ok: false,
              message: `锚点在文稿中出现 ${matches} 处，无法确定目标位置，请在编辑器中选中对应段落后重试`,
            };
          }
          return { ok: false, message: "未能在编辑器中定位原文锚点，请人工核对" };
        }
        const current = matchedText.replace(/\s+/g, "");
        const expected = change.anchor_text.replace(/\s+/g, "");
        if (current !== expected) {
          return {
            ok: false,
            message: "锚点与当前文稿内容不一致（文稿可能已改动），请重新生成提案",
          };
        }
        if (change.type === "delete") {
          const beforeLen = ed.getText().length;
          ed.chain()
            .setTextSelection({ from: hit.from, to: hit.to })
            .deleteSelection()
            .run();
          if (ed.getText().length >= beforeLen) {
            return { ok: false, message: "删除未生效，请重试" };
          }
          return { ok: true, message: "已删除选中原文" };
        }
        const nodes = parseContentToNodes(change.content || "");
        if (nodes.length === 0) return { ok: false, message: "替换内容为空" };
        ed.chain()
          .setTextSelection({ from: hit.from, to: hit.to })
          .insertContent(nodes as never)
          .run();
        const firstText = (nodes[0].content?.[0] as { text?: string } | undefined)?.text || "";
        if (firstText && !ed.getText().includes(firstText.slice(0, 15))) {
          return { ok: false, message: "替换后校验失败，请用编辑器撤销（⌘Z）后重试" };
        }
        return { ok: true, message: "已替换原文段落" };
      }
      return { ok: false, message: "未知的修改类型" };
    } catch (e) {
      return { ok: false, message: `应用失败：${(e as Error).message}` };
    }
  };

  const markCitationStatus = (
    ed: NonNullable<typeof editorRef.current>,
    verify: ProposalVerify[]
  ) => {
    const updates: { pos: number; attrs: Record<string, unknown>; status: string }[] = [];
    let idx = 0;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === "citation" && idx < verify.length) {
        if (verify[idx].status !== node.attrs.status) {
          updates.push({ pos, attrs: node.attrs, status: verify[idx].status });
        }
        idx += 1;
      }
      return true;
    });
    if (updates.length > 0) {
      const tr = ed.state.tr;
      for (const u of updates.reverse()) {
        tr.setNodeMarkup(u.pos, undefined, { ...u.attrs, status: u.status });
      }
      ed.view.dispatch(tr);
    }
  };

  const handleWritingChat = async () => {
    const msg = writingInput.trim();
    if (!msg || writingLoading || !draft) return;
    setWritingInput("");
    setWritingMessages((m) => [...m, { role: "user", content: msg }]);
    setWritingLoading(true);
    setGenStatus("AI 正在检索证据并生成提案…");
    try {
      const res = await api<{
        proposal_type: string;
        proposal: WritingMsg["proposal"];
        verify: ProposalVerify[];
      }>(`/api/drafts/${draft.id}/writing-chat`, {
        method: "POST",
        body: JSON.stringify({
          message: msg,
          history: writingMessages
            .filter((m) => !m.proposal || m.proposal.type === "reply")
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content })),
          selection: selectionText || undefined,
          drafting_context: draftingSummary(),
          selected_note_keys: Array.from(
            new Set(
              materials
                .filter((m) => selectedMaterials.has(m.id))
                .map((m) => m.chunk_key)
                .filter((k): k is string => Boolean(k))
            )
          ),
        }),
      });
      setWritingMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.proposal?.type === "reply" ? res.proposal.content || "" : "",
          proposal: res.proposal,
          verify: res.verify,
        },
      ]);
      setGenStatus(
        res.proposal_type === "reply" ? "" : "提案已生成，请审核后选择采纳或拒绝"
      );
    } catch (e) {
      showToast((e as Error).message);
      setGenStatus("");
    } finally {
      setWritingLoading(false);
    }
  };

  const applyProposal = async (msgIdx: number) => {
    const ed = editorRef.current;
    const msg = writingMessages[msgIdx];
    if (!ed || !msg?.proposal) return;
    const { type, content, anchor_text, anchor_occurrence } = msg.proposal;
    if (type === "reply") return;
    const result = applyContentChange(ed, {
      type: type || "",
      anchor_text,
      anchor_occurrence,
      content,
    });
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    if (msg.verify && msg.verify.length) markCitationStatus(ed, msg.verify);
    setWritingMessages((m) => m.map((x, i) => (i === msgIdx ? { ...x, status: "applied" } : x)));
    showToast(`已采纳：${result.message}`);
    if (draft) {
      api(`/api/drafts/${draft.id}/feedback`, {
        method: "POST",
        body: JSON.stringify({
          action: "accept",
          content_ref: (content || anchor_text || "").slice(0, 1500),
          diff_summary: type,
        }),
      }).catch(() => {});
    }
    setGenStatus("");
  };

  const rejectProposal = (msgIdx: number) => {
    const msg = writingMessages[msgIdx];
    setWritingMessages((m) => m.map((x, i) => (i === msgIdx ? { ...x, status: "rejected" } : x)));
    setGenStatus("");
    if (draft && msg?.proposal?.content) {
      api(`/api/drafts/${draft.id}/feedback`, {
        method: "POST",
        body: JSON.stringify({
          action: "reject",
          content_ref: msg.proposal.content.slice(0, 1500),
          diff_summary: msg.proposal.type,
        }),
      }).catch(() => {});
    }
  };

  const sendSelectionToChat = () => {
    if (!selectionText) return;
    setMode("writing");
    setWritingInput(
      `针对选中段落：「${selectionText.slice(0, 150)}${selectionText.length > 150 ? "…" : ""}」，我的要求：`
    );
    setSelectionText(null);
  };


  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", content: msg }]);
    setChatLoading(true);
    try {
      const res = await api<{ reply: string }>(`/api/projects/${projectId}/drafting-chat`, {
        method: "POST",
        body: JSON.stringify({
          message: msg,
          history: chatMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      setChatMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setChatLoading(false);
    }
  };

  const syncOutlineFromChat = async () => {
    if (chatMessages.length === 0 || chatLoading) return;
    setChatLoading(true);
    try {
      const res = await api<{ outline_md: string }>(
        `/api/projects/${projectId}/drafting-outline`,
        {
          method: "POST",
          body: JSON.stringify({
            history: chatMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        }
      );
      if (res.outline_md && res.outline_md.trim()) {
        setOutlineText(res.outline_md.trim());
        showToast("AI 已将商讨共识提炼为 Markdown 大纲，可预览/编辑后同步到编辑器");
      } else {
        showToast("未能从商讨中提炼出大纲");
      }
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setChatLoading(false);
    }
  };

  const parseMarkdownToNodes = (md: string) => {
    const lines = md.split("\n");
    const nodes: object[] = [];
    let listBuf: string[] = [];
    const flushList = () => {
      if (listBuf.length) {
        nodes.push({
          type: "bulletList",
          content: listBuf.map((item) => ({
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: item }] },
            ],
          })),
        });
        listBuf = [];
      }
    };
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        flushList();
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.+)$/);
      if (h) {
        flushList();
        nodes.push({
          type: "heading",
          attrs: { level: Math.min(h[1].length, 3) },
          content: [{ type: "text", text: h[2].trim() }],
        });
        continue;
      }
      const li = line.match(/^\s*[-*]\s+(.+)$/);
      if (li) {
        listBuf.push(li[1].trim());
        continue;
      }
      flushList();
      nodes.push({
        type: "paragraph",
        content: [{ type: "text", text: line.trim() }],
      });
    }
    flushList();
    return nodes;
  };

  const syncOutlineToEditor = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const content = parseMarkdownToNodes(outlineText);
    if (content.length) {
      ed.chain().focus().setContent({ type: "doc", content } as never).run();
      api(`/api/drafts/${draft!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ outline_json: { markdown: outlineText } }),
      }).catch(() => {});
      showToast("大纲已同步到编辑器");
    }
  };

  const runReview = async () => {
    if (!draft || reviewLoading) return;
    setReviewLoading(true);
    setReviewCards([]);
    setSelectedCards(new Set());
    setResolvedCards(new Set());
    setFixResults([]);
    try {
      const res = await api<{ cards: ReviewCard[]; rubric: RubricInfo }>(
        `/api/drafts/${draft.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({ text: selectionText || undefined }),
        }
      );
      setReviewCards(res.cards);
      if (res.rubric) setRubric(res.rubric);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setReviewLoading(false);
    }
  };

  const toggleCard = (i: number) => {
    if (resolvedCards.has(i)) return;
    setSelectedCards((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const runFixApply = async () => {
    if (!draft || fixLoading || selectedCards.size === 0) return;
    const chosenIdx = reviewCards
      .map((_, i) => i)
      .filter((i) => selectedCards.has(i) && !resolvedCards.has(i));
    if (chosenIdx.length === 0) return;
    const chosen = chosenIdx.map((i) => reviewCards[i]);
    setFixLoading(true);
    showToast(`AI 正在修改 ${chosen.length} 处问题并自动校验…`);
    try {
      const res = await api<{
        results: {
          anchor_text: string;
          fixed: string;
          citation_intact: boolean;
          check: { passed: boolean; reason: string };
        }[];
      }>(`/api/drafts/${draft.id}/review-apply`, {
        method: "POST",
        body: JSON.stringify({
          items: chosen.map((c) => ({
            anchor_text: c.anchor_text,
            issue: c.issue,
            suggestion: c.suggestion,
          })),
        }),
      });
      setFixResults(
        res.results.map((r, i) => ({
          ...r,
          issue: chosen[i].issue,
          suggestion: chosen[i].suggestion,
          cardIndex: chosenIdx[i],
        }))
      );
      const ok = res.results.filter((r) => r.check.passed && r.citation_intact).length;
      showToast(`修改完成：${ok}/${res.results.length} 处通过自动校验，请逐条审核采纳`);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setFixLoading(false);
    }
  };

  const applyOneFix = (idx: number) => {
    const ed = editorRef.current;
    const r = fixResults[idx];
    if (!ed || !r || r.applied) return;
    const card = r.cardIndex !== undefined ? reviewCards[r.cardIndex] : undefined;
    const cardOcc =
      card && card.anchor_text === r.anchor_text ? card.anchor_occurrence : undefined;
    const result = applyContentChange(ed, {
      type: "replace",
      anchor_text: r.anchor_text,
      anchor_occurrence: cardOcc,
      content: r.fixed,
    });
    if (!result.ok) {
      const overlap = fixResults.find(
        (x) => x.applied && x !== r && anchorsOverlap(x.anchor_text, r.anchor_text)
      );
      if (overlap) {
        setFixResults((list) => list.map((x, i) => (i === idx ? { ...x, conflict: true } : x)));
        showToast("该段落已被先前采纳的修改覆盖，请点击「基于当前文本重试」重新生成修复");
        return;
      }
      showToast(result.message);
      return;
    }
    setFixResults((list) =>
      list.map((x, i) => (i === idx ? { ...x, applied: true, conflict: false } : x))
    );
    if (r.cardIndex !== undefined) {
      setResolvedCards((s) => {
        const n = new Set(s);
        n.add(r.cardIndex as number);
        return n;
      });
      setSelectedCards((s) => {
        const n = new Set(s);
        n.delete(r.cardIndex as number);
        return n;
      });
    }
    showToast(`该处修改已写入编辑器（${result.message}）`);
  };

  const discardOneFix = (idx: number) => {
    setFixResults((list) => list.map((x, i) => (i === idx ? { ...x, discarded: true } : x)));
  };

  const anchorsOverlap = (a: string, b: string) => {
    const na = a.replace(/\s+/g, "");
    const nb = b.replace(/\s+/g, "");
    if (!na || !nb) return false;
    return na.includes(nb) || nb.includes(na);
  };

  const retryFix = async (idx: number) => {
    if (!draft || fixLoading) return;
    const r = fixResults[idx];
    if (!r) return;
    const overlap = fixResults.find(
      (x) => x.applied && x !== r && anchorsOverlap(x.anchor_text, r.anchor_text)
    );
    const currentText = overlap?.fixed || "";
    if (!currentText) {
      showToast("未找到已采纳的覆盖修改，无法重试");
      return;
    }
    setFixLoading(true);
    try {
      const res = await api<{
        results: {
          anchor_text: string;
          fixed: string;
          citation_intact: boolean;
          check: { passed: boolean; reason: string };
        }[];
      }>(`/api/drafts/${draft.id}/review-apply`, {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              anchor_text: r.anchor_text,
              current_text: currentText,
              issue: r.issue || "",
              suggestion: r.suggestion || "",
            },
          ],
        }),
      });
      const fresh = res.results[0];
      if (!fresh) throw new Error("重试未返回结果");
      setFixResults((list) =>
        list.map((x, i) =>
          i === idx
            ? { ...x, ...fresh, conflict: false }
            : x
        )
      );
      showToast("已基于当前段落文本重新生成修复，请审核采纳");
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setFixLoading(false);
    }
  };

  const locateAnchor = (anchor: string, occurrence?: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    const { hit } = findAnchorRange(ed, anchor, occurrence);
    if (!hit) return;
    ed.commands.setTextSelection({ from: hit.from, to: hit.to });
    (ed.view.dom as HTMLElement).focus();
  };

  const doExport = async (format: string) => {
    if (!draft) return;
    showToast(`导出 ${format} 中…`);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/drafts/${draft.id}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const fnMatch = cd.match(/filename="([^"]+)"/);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fnMatch?.[1] || `draft.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("导出成功");
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`);
    }
  };

  const restoreSnapshot = async (id: number) => {
    if (!draft) return;
    const updated = await api<DraftInfo>(
      `/api/drafts/${draft.id}/snapshots/${id}:restore`,
      { method: "POST" }
    );
    editorRef.current?.commands.setContent(
      (updated.content_json as never) || { type: "doc", content: [] }
    );
    setShowSnapshots(false);
    showToast("已回退到所选版本");
  };

  const toggleMaterial = (id: number) => {
    setSelectedMaterials((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectableMaterials = materials.filter((m) => m.chunk_key);
  const allSelected =
    selectableMaterials.length > 0 &&
    selectableMaterials.every((m) => selectedMaterials.has(m.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedMaterials(new Set());
    else setSelectedMaterials(new Set(selectableMaterials.map((m) => m.id)));
  };

  if (!draft || !editorReady) {
    return <div className="px-8 py-10 text-sm text-neutral-400">工作台加载中…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5">
        <div className="flex items-center gap-1">
          {(
            [
              ["drafting", "起草模式"],
              ["writing", "写作模式"],
              ["review", "审查模式"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                mode === m
                  ? "bg-blue-600 font-medium text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {genStatus && <span className="text-xs text-neutral-500">{genStatus}</span>}
          <div className="relative">
            <button
              onClick={() => setShowSnapshots((v) => !v)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              版本历史（{snapshots.length}）
            </button>
            {showSnapshots && (
              <div className="absolute right-0 top-9 z-40 max-h-72 w-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
                {snapshots.length === 0 && (
                  <div className="p-2 text-xs text-neutral-400">暂无快照</div>
                )}
                {snapshots.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => restoreSnapshot(s.id)}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-neutral-100"
                  >
                    <span className="font-medium">{s.note || "快照"}</span>{" "}
                    <span className="text-neutral-400">
                      {new Date(s.created_at).toLocaleString("zh-CN")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {(["docx", "tex", "md"] as const).map((f) => (
            <button
              key={f}
              onClick={() => doExport(f)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              导出 {f}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50">
          <div className="border-b border-neutral-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                全文大纲
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOutlinePreview((v) => !v)}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    outlinePreview
                      ? "bg-blue-100 font-medium text-blue-700"
                      : "text-neutral-500 hover:text-blue-600"
                  }`}
                >
                  {outlinePreview ? "回到编辑" : "预览"}
                </button>
                <button
                  onClick={syncOutlineToEditor}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  同步到编辑器
                </button>
              </div>
            </div>
            {outlinePreview ? (
              <div className="markdown-chat mt-2 max-h-48 max-w-none overflow-y-auto rounded border border-neutral-200 bg-white p-2 text-xs leading-relaxed">
                {outlineText.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{outlineText}</ReactMarkdown>
                ) : (
                  <span className="text-neutral-400">（空大纲）</span>
                )}
              </div>
            ) : (
              <textarea
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                rows={6}
                placeholder={"Markdown 格式：\n# 引言\n- 研究背景要点1\n# 文献综述"}
                className="mt-2 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs focus:border-blue-500 focus:outline-none"
              />
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                精读素材区（{materials.length}）
              </h3>
              {selectableMaterials.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  {allSelected ? "清空勾选" : "全选"}
                </button>
              )}
            </div>
            <p className="mt-1 text-[10px] text-neutral-400">
              勾选素材后点击续写，AI 将优先引用这些高权重片段（已勾选{" "}
              {selectedMaterials.size} 条）
            </p>
            <div className="mt-2 space-y-2">
              {materials.length === 0 && (
                <div className="text-xs text-neutral-400">暂无批注素材，先去精读文献</div>
              )}
              {materials.map((m) => (
                <label
                  key={m.id}
                  className={`block cursor-pointer rounded-lg border p-2.5 text-xs transition ${
                    selectedMaterials.has(m.id)
                      ? "border-blue-400 bg-blue-50"
                      : "border-neutral-200 bg-white hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {m.chunk_key && (
                      <input
                        type="checkbox"
                        checked={selectedMaterials.has(m.id)}
                        onChange={() => toggleMaterial(m.id)}
                      />
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        m.kind === "tag"
                          ? "bg-green-100 text-green-700"
                          : m.kind === "note"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {m.tag_label || (m.kind === "note" ? "备注" : "划线")}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-3 text-neutral-600">
                    {m.quote_text || m.text}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </aside>

        <div className="relative min-w-0 flex-1 bg-white">
          <EditorPanel
            initialContent={draft.content_json}
            onUpdate={saveContent}
            onSelection={setSelectionText}
            editorRef={editorRef}
            onSlashContinue={() => {}}
          />
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-neutral-100 bg-white/90 px-5 py-2.5 backdrop-blur">
            <span className="text-[11px] text-neutral-400">
              所有 AI 修改需在右侧提案卡中审核采纳后才会写入编辑器
            </span>
            {selectionText && (
              <button
                onClick={sendSelectionToChat}
                className="ml-auto rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
              >
                将选段发送到 AI 讨论
              </button>
            )}
          </div>
        </div>

        <aside className="flex w-80 shrink-0 flex-col border-l border-neutral-200 bg-neutral-50">
          {mode === "drafting" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  起草商讨
                </h3>
                <button
                  onClick={syncOutlineFromChat}
                  disabled={chatLoading || chatMessages.length === 0}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  title="AI 将整段商讨提炼为结构化大纲并填入左侧大纲区"
                >
                  {chatLoading ? "提炼中…" : "同步到大纲"}
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {chatMessages.length === 0 && (
                  <div className="text-xs text-neutral-400">
                    与 AI 商讨大纲逻辑与摘要要点，例如：「基于现有文献，引言应该如何组织？」
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      m.role === "user"
                        ? "ml-6 bg-blue-600 text-white"
                        : "mr-6 bg-white text-neutral-700 shadow-sm"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <div className="draft-md [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_h1]:my-2 [&_h1]:text-sm [&_h1]:font-bold [&_h2]:my-2 [&_h2]:text-[13px] [&_h2]:font-semibold [&_h3]:my-1.5 [&_h3]:text-xs [&_h3]:font-semibold [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-neutral-100 [&_pre]:p-2 [&_pre]:text-[11px] [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-2 [&_blockquote]:text-neutral-500 [&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:border-neutral-300 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-neutral-300 [&_td]:px-2 [&_td]:py-1 [&_hr]:my-2 [&_hr]:border-neutral-200">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      m.content
                    )}
                  </div>
                ))}
                {chatLoading && <div className="text-xs text-neutral-400">思考中…</div>}
              </div>
              <div className="border-t border-neutral-200 p-3">
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleChat()}
                    placeholder="输入你的想法…"
                    className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleChat}
                    className="rounded bg-blue-600 px-3 text-xs text-white hover:bg-blue-700"
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === "writing" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-neutral-200 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  写作助手对话
                </h3>
                <p className="mt-0.5 text-[10px] text-neutral-400">
                  指令示例：续写当前段落 / 把第二段改得更学术 / 补充方法论证据。AI 生成提案后需你采纳才写入
                </p>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {writingMessages.length === 0 && (
                  <div className="text-xs text-neutral-400">
                    与写作助手对话，例如：「根据大纲续写引言第一段」
                  </div>
                )}
                {writingMessages.map((m, i) => (
                  <div key={i} className="space-y-2">
                    <div
                      className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                        m.role === "user"
                          ? "ml-4 bg-blue-600 text-white"
                          : m.content
                            ? "mr-4 whitespace-pre-wrap bg-white text-neutral-700 shadow-sm"
                            : ""
                      }`}
                    >
                      {m.role === "user" ? m.content : m.content}
                    </div>
                    {m.proposal && m.proposal.type !== "reply" && (
                      <div
                        className={`mr-2 rounded-xl border p-3 ${
                          m.status === "applied"
                            ? "border-emerald-200 bg-emerald-50/50"
                            : m.status === "rejected"
                              ? "border-neutral-200 bg-neutral-50 opacity-60"
                              : "border-blue-200 bg-blue-50/40"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              m.proposal.type === "append"
                                ? "bg-emerald-100 text-emerald-700"
                                : m.proposal.type === "replace"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {m.proposal.type === "append"
                              ? "续写追加"
                              : m.proposal.type === "replace"
                                ? "替换原文"
                                : "删除原文"}
                          </span>
                          {m.status === "applied" && (
                            <span className="text-[10px] font-medium text-emerald-600">✓ 已采纳写入</span>
                          )}
                          {m.status === "rejected" && (
                            <span className="text-[10px] font-medium text-neutral-500">已拒绝</span>
                          )}
                        </div>
                        {m.proposal.reason && (
                          <div className="mt-1 text-[11px] text-neutral-500">
                            {m.proposal.reason}
                          </div>
                        )}
                        {m.proposal.anchor_text && (
                          <div
                            className={`mt-1.5 rounded border-l-2 bg-white/70 px-2 py-1 text-[11px] text-neutral-500 ${
                              m.proposal.type === "delete"
                                ? "border-red-300"
                                : "border-orange-300"
                            }`}
                          >
                            {m.proposal.type === "delete" ? "将删除：" : "将替换："}「
                            {m.proposal.anchor_text.slice(0, 80)}」
                          </div>
                        )}
                        {m.proposal.type !== "delete" && (
                          <div className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white p-2.5 text-xs leading-relaxed text-neutral-800">
                            {renderCitationLabels(m.proposal.content || "", citationMeta)}
                          </div>
                        )}
                        {m.verify && m.verify.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {m.verify.map((v, vi) => (
                              <span
                                key={vi}
                                className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${
                                  v.status === "normal"
                                    ? "bg-blue-100 text-blue-700"
                                    : v.status === "weak"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-red-100 text-red-600 line-through"
                                }`}
                                title={
                                  v.status === "normal"
                                    ? "引用校验通过"
                                    : v.status === "weak"
                                      ? "语义支持较弱，建议人工核对"
                                      : "引用无效（不在证据列表）"
                                }
                              >
                                [{v.chunk_key}]
                              </span>
                            ))}
                          </div>
                        )}
                        {!m.status && (
                          <div className="mt-2.5 flex gap-2">
                            <button
                              onClick={() => applyProposal(i)}
                              className="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                            >
                              采纳并写入编辑器
                            </button>
                            <button
                              onClick={() => rejectProposal(i)}
                              className="rounded-lg border border-neutral-300 px-3 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100"
                            >
                              拒绝
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {writingLoading && (
                  <div className="animate-pulse text-xs text-neutral-400">
                    AI 正在检索证据并起草提案…
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2 border-t border-neutral-200 p-3">
                <input
                  value={writingInput}
                  onChange={(e) => setWritingInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleWritingChat()}
                  placeholder={
                    selectionText
                      ? "已选段，输入修改要求…"
                      : "输入写作指令，如：续写引言…"
                  }
                  className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={handleWritingChat}
                  disabled={writingLoading}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  发送
                </button>
              </div>
            </div>
          )}

          {mode === "review" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-neutral-200 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    同行评审建议
                  </h3>
                  <button
                    onClick={() => setShowRubric((v) => !v)}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    {showRubric ? "收起判据" : "五维判据说明"}
                  </button>
                </div>
                <button
                  onClick={runReview}
                  disabled={reviewLoading}
                  className="mt-2 w-full rounded-lg bg-neutral-800 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  {reviewLoading
                    ? "评审中（约 30 秒）…"
                    : selectionText
                      ? "审查选中段落"
                      : "审查全文"}
                </button>
                {reviewCards.length > 0 && (
                  <button
                    onClick={runFixApply}
                    disabled={fixLoading || selectedCards.size === 0}
                    className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {fixLoading
                      ? "AI 修改并校验中（约 40 秒）…"
                      : `AI 一键修改所选问题（已选 ${selectedCards.size} 条）`}
                  </button>
                )}
                {reviewCards.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {["all", "high", "medium", "low"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSeverityFilter(s)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                          severityFilter === s
                            ? "bg-neutral-800 font-medium text-white"
                            : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                        }`}
                      >
                        {s === "all" ? `全部 ${reviewCards.length}` : `${SEVERITY_LABELS[s]} ${reviewCards.filter((c) => c.severity === s).length}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {showRubric && (
                <div className="border-b border-neutral-200 bg-blue-50/50 p-4 text-[11px] leading-relaxed">
                  {rubric ? (
                    <>
                      {rubric.dimensions.map((d) => (
                        <div key={d.key} className="mb-1.5">
                          <span className="font-semibold text-neutral-700">
                            {d.name}
                          </span>
                          <span className="text-neutral-500">
                            ：{d.indicators.map((x) => x.split("（")[0]).join("、")}
                          </span>
                        </div>
                      ))}
                      <div className="mt-2 border-t border-blue-100 pt-2 text-neutral-500">
                        <span className="font-semibold">严重度判据：</span>
                        必须修改 = {rubric.severity_anchors.high}；应当修改 ={" "}
                        {rubric.severity_anchors.medium}；可选润色 ={" "}
                        {rubric.severity_anchors.low}
                      </div>
                    </>
                  ) : (
                    <div className="text-neutral-400">执行一次审查后显示判据</div>
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                {reviewCards.length === 0 && !reviewLoading && (
                  <div className="text-xs leading-relaxed text-neutral-400">
                    AI 将以同行评审视角，从五个维度评审：论证充分性、逻辑连贯性、结构完整性、学术规范性、方法严谨性，每条建议标注检查点、严重度与修改成本
                  </div>
                )}
                {DIMENSION_ORDER.filter((dim) =>
                  reviewCards.some(
                    (c) =>
                      c.dimension === dim &&
                      (severityFilter === "all" || c.severity === severityFilter)
                  )
                ).map((dim) => (
                  <div key={dim}>
                    <div className="mb-1.5 text-[11px] font-bold text-neutral-500">
                      {DIMENSION_LABELS[dim] || dim}
                    </div>
                    <div className="space-y-2.5">
                      {reviewCards
                        .filter(
                          (c) =>
                            c.dimension === dim &&
                            (severityFilter === "all" || c.severity === severityFilter)
                        )
                        .map((c, i) => {
                          const gi = reviewCards.indexOf(c);
                          const resolved = resolvedCards.has(gi);
                          return (
                          <div
                            key={i}
                            className={`rounded-lg border p-3 transition ${
                              resolved
                                ? "border-neutral-100 bg-neutral-50 opacity-50"
                                : "border-neutral-200 bg-white"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              {resolved ? (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                  ✓ 已修复
                                </span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={selectedCards.has(gi)}
                                  onChange={() => toggleCard(gi)}
                                  title="勾选后可一键修改"
                                  className="h-3.5 w-3.5"
                                />
                              )}
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[c.severity] || SEVERITY_COLORS.low}`}
                              >
                                {SEVERITY_LABELS[c.severity] || c.severity}
                              </span>
                              {c.indicator && (
                                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[9px] text-neutral-500">
                                  {c.indicator}
                                </span>
                              )}
                              {c.fix_effort && (
                                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-500">
                                  {c.fix_effort === "small" ? "小改" : "大改"}
                                </span>
                              )}
                            </div>
                            {c.anchor_text && (
                              <button
                                onClick={() => locateAnchor(c.anchor_text, c.anchor_occurrence)}
                                className="mt-2 block w-full truncate rounded border-l-2 border-neutral-300 pl-2 text-left text-[11px] italic text-neutral-500 hover:border-blue-400"
                                title="点击在编辑器中定位"
                              >
                                “{c.anchor_text.slice(0, 60)}”
                              </button>
                            )}
                            <div className="mt-1.5 text-xs text-neutral-700">{c.issue}</div>
                            <div className="mt-1 text-xs text-emerald-700">
                              建议：{c.suggestion}
                            </div>
                          </div>
                          );
                        })}
                    </div>
                  </div>
                ))}

                {fixResults.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-bold text-neutral-500">
                      AI 修改结果（逐条审核）
                    </div>
                    <div className="space-y-2.5">
                      {fixResults.map((r, i) => (
                        <div
                          key={i}
                          className={`rounded-lg border p-3 ${
                            r.applied
                              ? "border-emerald-200 bg-emerald-50/50"
                              : r.discarded
                                ? "border-neutral-200 bg-neutral-50 opacity-60"
                                : "border-orange-200 bg-orange-50/40"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                r.check.passed && r.citation_intact
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {r.check.passed && r.citation_intact
                                ? "✓ 校验通过"
                                : "⚠ 需人工复核"}
                            </span>
                            {!r.citation_intact && (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-600">
                                原引用标记不完整
                              </span>
                            )}
                            <span className="text-[10px] text-neutral-500">
                              {r.check.reason}
                            </span>
                          </div>
                          <div className="mt-2 rounded border-l-2 border-red-200 bg-white/70 px-2 py-1 text-[11px] text-neutral-500">
                            原文：{r.anchor_text.slice(0, 90)}
                            {r.anchor_text.length > 90 ? "…" : ""}
                          </div>
                          <div className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border-l-2 border-emerald-300 bg-white/70 px-2 py-1 text-[11px] text-neutral-700">
                            改后：{r.fixed}
                          </div>
                          {r.conflict && !r.applied && (
                            <div className="mt-2 flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
                              <span className="text-[10px] text-amber-700">
                                该段落已被先前采纳的修改覆盖
                              </span>
                              <button
                                onClick={() => retryFix(i)}
                                disabled={fixLoading}
                                className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                              >
                                {fixLoading ? "重试中…" : "基于当前文本重试"}
                              </button>
                            </div>
                          )}
                          {!r.applied && !r.discarded && !r.conflict && (
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => applyOneFix(i)}
                                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                              >
                                采纳此修改
                              </button>
                              <button
                                onClick={() => discardOneFix(i)}
                                className="rounded border border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100"
                              >
                                放弃
                              </button>
                            </div>
                          )}
                          {r.applied && (
                            <div className="mt-1.5 text-[10px] font-medium text-emerald-600">
                              ✓ 已写入编辑器
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast.slice(0, 200)}
        </div>
      )}
    </div>
  );
}
