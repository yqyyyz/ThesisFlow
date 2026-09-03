"use client";

import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import DocTextView from "./DocTextView";
import type { SelectionInfo, HighlightBox } from "./PdfViewer";

const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

interface AnnotationItem {
  id: number;
  doc_id: number;
  chunk_key: string | null;
  kind: string;
  tag_label: string | null;
  text: string | null;
  quote_text: string | null;
  page_no: number | null;
  bbox: { page: number; x0: number; y0: number; x1: number; y1: number } | null;
  created_at: string;
}

interface PreReadStructured {
  core_question: string;
  methods: string[];
  conclusions: string[];
  contributions: string;
  limitations: string;
}

interface PreRead {
  doc_id: number;
  title: string | null;
  markdown: string;
  structured: PreReadStructured | null;
  scores: Record<string, { score: number; reason: string }> | null;
}

interface ChatRef {
  ref: string;
  chunk_key: string;
  page_no: number | null;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  refs?: ChatRef[];
}

const TAG_COLORS: Record<string, string> = {
  重点论据: "#16a34a",
  借鉴方法: "#2563eb",
  存疑之处: "#dc2626",
  背景知识: "#9333ea",
};
const TAG_LABELS = ["重点论据", "借鉴方法", "存疑之处", "背景知识"];

export default function ReaderOverlay({
  docId,
  docTitle,
  focusChunk,
  onClose,
}: {
  docId: number;
  docTitle: string;
  focusChunk?: string | null;
  onClose: () => void;
}) {
  const [docKind, setDocKind] = useState<string>("pdf");
  const [preRead, setPreRead] = useState<PreRead | null>(null);
  const [preReadLoading, setPreReadLoading] = useState(true);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadAnnotations = useCallback(async () => {
    const data = await api<AnnotationItem[]>(`/api/documents/${docId}/annotations`);
    setAnnotations(data);
  }, [docId]);

  useEffect(() => {
    setPreReadLoading(true);
    api<PreRead>(`/api/documents/${docId}/pre-read`)
      .then(setPreRead)
      .catch((e) => setToast((e as Error).message))
      .finally(() => setPreReadLoading(false));
    loadAnnotations().catch(() => {});
    api<{ kind: string }>(`/api/documents/${docId}`)
      .then((d) => d.kind && setDocKind(d.kind))
      .catch(() => {});
  }, [docId, loadAnnotations]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const createAnnotation = async (payload: Record<string, unknown>) => {
    try {
      await api(`/api/documents/${docId}/annotations`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadAnnotations();
      showToast("批注已保存，对应片段已升为高权重检索素材");
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const clearSelection = () => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const selectionBbox = () =>
    selection?.rects && selection.rects.length > 0
      ? { page: selection.page, rects: selection.rects }
      : undefined;

  const handleTag = (tag: string) => {
    if (!selection) return;
    createAnnotation({
      kind: "tag",
      tag_label: tag,
      quote_text: selection.text,
      page_no: selection.page || null,
      chunk_key: selection.chunkKey || null,
      bbox: selectionBbox(),
    });
    clearSelection();
  };

  const handleHighlight = () => {
    if (!selection) return;
    createAnnotation({
      kind: "highlight",
      quote_text: selection.text,
      page_no: selection.page || null,
      chunk_key: selection.chunkKey || null,
      bbox: selectionBbox(),
    });
    clearSelection();
  };

  const handleNoteSave = () => {
    if (!selection || !noteText.trim()) return;
    createAnnotation({
      kind: "note",
      text: noteText.trim(),
      quote_text: selection.text,
      page_no: selection.page || null,
      chunk_key: selection.chunkKey || null,
      bbox: selectionBbox(),
    });
    setNoteText("");
    setNoteMode(false);
    clearSelection();
  };

  const handleChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", content: msg }]);
    setChatLoading(true);
    try {
      const res = await api<{ reply: string; refs: ChatRef[] }>(
        `/api/documents/${docId}/chat`,
        {
          method: "POST",
          body: JSON.stringify({
            message: msg,
            history: chatMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        }
      );
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: res.reply, refs: res.refs },
      ]);
    } catch (e) {
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: `问答失败：${(e as Error).message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const flashElement = (el: HTMLElement) => {
    el.classList.add("tf-flash");
    setTimeout(() => el.classList.remove("tf-flash"), 1600);
  };

  const focusedChunkRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusChunk || focusedChunkRef.current === focusChunk) return;
    focusedChunkRef.current = focusChunk;
    const tryLocate = async (attempt: number) => {
      if (attempt > 3) return;
      const res = await api<{ page_no: number | null }>(
        `/api/documents/${docId}/chunks/${encodeURIComponent(focusChunk)}/locate`
      ).catch(() => null);
      const pageNo = res?.page_no ?? null;
      if (docKind === "pdf" && pageNo) {
        const pageEl = document.querySelector(
          `.tf-page[data-pageno="${pageNo}"]`
        ) as HTMLElement | null;
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
          flashElement(pageEl);
          return;
        }
      }
      const block = document.querySelector(
        `[data-chunkkey="${focusChunk}"]`
      ) as HTMLElement | null;
      if (block) {
        block.scrollIntoView({ behavior: "smooth", block: "center" });
        flashElement(block);
        return;
      }
      setTimeout(() => tryLocate(attempt + 1), 700);
    };
    const t = setTimeout(() => tryLocate(0), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusChunk, docId, docKind]);

  const jumpToRef = (ref: string, refs?: ChatRef[]) => {
    const target = refs?.find((r) => r.ref === ref);
    if (!target) {
      showToast("未找到该来源引用");
      return;
    }
    if (docKind === "pdf" && target.page_no) {
      const pageEl = document.querySelector(
        `.tf-page[data-pageno="${target.page_no}"]`
      ) as HTMLElement | null;
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        flashElement(pageEl);
        showToast(`已定位到第 ${target.page_no} 页`);
        return;
      }
    }
    if (target.chunk_key) {
      const block = document.querySelector(
        `[data-chunkkey="${target.chunk_key}"]`
      ) as HTMLElement | null;
      if (block) {
        block.scrollIntoView({ behavior: "smooth", block: "center" });
        flashElement(block);
        showToast("已定位到来源片段");
        return;
      }
    }
    showToast(`来源片段：${target.chunk_key || ref}`);
  };

  const deleteAnnotation = async (id: number) => {
    await api(`/api/annotations/${id}`, { method: "DELETE" });
    await loadAnnotations();
  };

  const highlights: HighlightBox[] = annotations
    .filter((a) => a.bbox || docKind !== "pdf")
    .filter((a) => !!a.bbox)
    .map((a) => ({
      id: a.id,
      page: a.bbox!.page,
      bbox: a.bbox!,
      rects:
        typeof (a.bbox as { rects?: unknown }).rects === "object"
          ? (a.bbox as unknown as { rects: HighlightBox["rects"] }).rects
          : undefined,
      quote: a.quote_text || undefined,
      color:
        a.kind === "tag"
          ? TAG_COLORS[a.tag_label || ""] || "#f59e0b"
          : a.kind === "note"
            ? "#f59e0b"
            : "#facc15",
      title: a.kind === "tag" ? a.tag_label || "" : a.text || a.quote_text || "",
    }));

  const docQuotes: HighlightBox[] =
    docKind === "pdf"
      ? highlights
      : annotations
          .filter((a) => a.quote_text)
          .map((a) => ({
            id: a.id,
            page: 0,
            bbox: (a.bbox as HighlightBox["bbox"]) || {
              page: 0,
              x0: 0,
              y0: 0,
              x1: 0,
              y1: 0,
            },
            quote: a.quote_text || undefined,
            color: "#facc15",
            title: a.tag_label || a.text || "",
          }));

  const renderChatContent = (msg: ChatMsg) => {
    if (msg.role === "user") return msg.content;
    const withLinks = msg.content.replace(/\[(c\d+)\]/g, "[[$1]](#ref-$1)");
    return (
      <div className="markdown-chat">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              if (href && href.startsWith("#ref-")) {
                const refId = href.slice(5);
                return (
                  <button
                    onClick={() => jumpToRef(refId, msg.refs)}
                    className="mx-0.5 inline-block rounded bg-blue-100 px-1 align-baseline font-mono text-[10px] font-semibold text-blue-700 hover:bg-blue-200"
                    title="点击定位来源"
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  {children}
                </a>
              );
            },
          }}
        >
          {withLinks}
        </ReactMarkdown>
      </div>
    );
  };

  const s = preRead?.structured;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate text-sm font-semibold text-neutral-800">
            精读：{docTitle}
          </span>
          <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">
            {docKind === "pdf" ? "PDF" : docKind === "docx" ? "Word" : "Markdown"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
        >
          ✕ 关闭
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[340px] shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-50 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            AI 解读
          </h3>
          {preReadLoading && (
            <div className="mt-4 animate-pulse space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-3 rounded bg-neutral-200" />
              ))}
            </div>
          )}
          {preRead && s && (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <div className="text-[11px] font-bold text-blue-800">核心研究问题</div>
                <p className="mt-1 text-xs leading-relaxed text-neutral-700">
                  {s.core_question}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="text-[11px] font-bold text-neutral-700">方法与数据</div>
                <ul className="mt-1.5 space-y-1">
                  {(s.methods || []).map((m, i) => (
                    <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-neutral-600">
                      <span className="mt-0.5 text-blue-500">▸</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="text-[11px] font-bold text-neutral-700">主要结论</div>
                <ul className="mt-1.5 space-y-1">
                  {(s.conclusions || []).map((m, i) => (
                    <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-neutral-600">
                      <span className="mt-0.5 text-emerald-500">▸</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                  <div className="text-[11px] font-bold text-emerald-800">贡献</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
                    {s.contributions}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                  <div className="text-[11px] font-bold text-amber-800">局限</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
                    {s.limitations}
                  </p>
                </div>
              </div>
            </div>
          )}
          {preRead && !s && preRead.markdown && (
            <div className="prose prose-sm mt-3 max-w-none text-neutral-700 prose-headings:text-neutral-800">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{preRead.markdown}</ReactMarkdown>
            </div>
          )}
          {preRead?.scores && (
            <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
              <div className="text-xs font-semibold text-neutral-500">四维评分理由</div>
              {Object.entries(preRead.scores).map(([dim, v]) => (
                <div key={dim} className="mt-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium text-neutral-700">
                      {
                        {
                          quality: "质量",
                          relevance: "相关性",
                          methodology: "方法论",
                          novelty: "创新性",
                        }[dim] || dim
                      }
                    </span>
                    <span className="font-bold text-blue-600">{v.score}</span>
                  </div>
                  <div className="mt-0.5 leading-relaxed text-neutral-500">{v.reason}</div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="relative min-w-0 flex-1">
          {docKind === "pdf" ? (
            <PdfViewer
              url={`${process.env.NEXT_PUBLIC_API_BASE}/api/documents/${docId}/file`}
              highlights={highlights}
              onSelect={setSelection}
            />
          ) : (
            <DocTextView docId={docId} highlights={docQuotes} onSelect={setSelection} />
          )}

          {selection && !noteMode && (
            <div
              className="fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg"
              style={{ left: selection.x, top: Math.max(selection.y - 48, 8) }}
            >
              {TAG_LABELS.map((t) => (
                <button
                  key={t}
                  onClick={() => handleTag(t)}
                  className="rounded px-2 py-1 text-xs font-medium text-white hover:opacity-80"
                  style={{ background: TAG_COLORS[t] }}
                >
                  {t}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-neutral-200" />
              <button
                onClick={handleHighlight}
                className="rounded bg-yellow-300 px-2 py-1 text-xs font-medium text-yellow-900 hover:opacity-80"
              >
                划线
              </button>
              <button
                onClick={() => setNoteMode(true)}
                className="rounded bg-orange-500 px-2 py-1 text-xs font-medium text-white hover:opacity-80"
              >
                备注
              </button>
            </div>
          )}
          {noteMode && selection && (
            <div
              className="fixed z-50 w-72 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg"
              style={{ left: selection.x, top: Math.max(selection.y + 8, 8) }}
            >
              <textarea
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="写下你的批注…"
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => setNoteMode(false)}
                  className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
                >
                  取消
                </button>
                <button
                  onClick={handleNoteSave}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                >
                  保存备注
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="flex w-[320px] shrink-0 flex-col border-l border-neutral-200 bg-neutral-50">
          <div className="flex h-1/3 min-h-0 flex-col border-b border-neutral-200">
            <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                批注沉淀（{annotations.length}）
              </h3>
            </div>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-3 pt-1">
              {annotations.length === 0 && (
                <div className="text-xs text-neutral-400">
                  在 PDF 中划选文字即可打标、划线或备注
                </div>
              )}
              {annotations.map((a) => (
                <div key={a.id} className="group rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{
                        background:
                          a.kind === "tag"
                            ? TAG_COLORS[a.tag_label || ""] || "#f59e0b"
                            : a.kind === "note"
                              ? "#f97316"
                              : "#eab308",
                      }}
                    >
                      {a.kind === "tag" ? a.tag_label : a.kind === "note" ? "备注" : "划线"}
                      {a.page_no ? ` · p.${a.page_no}` : ""}
                      {a.chunk_key ? ` · ${a.chunk_key}` : ""}
                    </span>
                    <button
                      onClick={() => deleteAnnotation(a.id)}
                      className="text-xs text-neutral-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
                    >
                      删除
                    </button>
                  </div>
                  {a.quote_text && (
                    <div className="mt-1.5 line-clamp-2 border-l-2 border-yellow-300 pl-2 text-[11px] italic text-neutral-500">
                      “{a.quote_text.slice(0, 120)}”
                    </div>
                  )}
                  {a.text && <div className="mt-1 text-xs text-neutral-700">{a.text}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex h-2/3 min-h-0 flex-col">
            <div className="shrink-0 px-4 pb-1 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                伴读问答
              </h3>
              <p className="mt-0.5 text-[10px] text-neutral-400">
                就本文献提问（含术语解释、公式解读），AI 基于原文回答并标注来源
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2">
              {chatMessages.length === 0 && (
                <div className="text-xs text-neutral-400">
                  例如：「这篇综述把偏见分为哪几个阶段？」「缩放点积注意力是什么？」
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "ml-4 whitespace-pre-wrap bg-blue-600 text-white"
                      : "mr-4 bg-white text-neutral-700 shadow-sm"
                  }`}
                >
                  {renderChatContent(m)}
                </div>
              ))}
              {chatLoading && <div className="text-xs text-neutral-400">思考中…</div>}
              <div ref={chatEndRef} />
            </div>
            <div className="flex shrink-0 gap-2 border-t border-neutral-200 p-3">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChat()}
                placeholder="向本文献提问…"
                className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleChat}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
              >
                提问
              </button>
            </div>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast.slice(0, 160)}
        </div>
      )}
    </div>
  );
}
