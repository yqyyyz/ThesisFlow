"use client";

import dynamic from "next/dynamic";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api, apiForm } from "@/lib/api";
import { useDemoStore } from "@/stores/demo";
import { useCitationMetaStore } from "@/stores/citationMeta";
import {
  STAGE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type DocumentItem,
  type Project,
} from "@/lib/types";

const ReaderOverlay = dynamic(
  () => import("@/components/reader/ReaderOverlay"),
  { ssr: false }
);
const DocMapGraph = dynamic(
  () => import("@/components/relation/DocMapGraph"),
  { ssr: false }
);
type DocMapData = import("@/components/relation/DocMapGraph").DocMapData;

interface Dimension {
  key: string;
  name: string;
  desc: string;
  weight: number;
}

const PENDING = ["uploaded", "dedup_checked", "parsing", "chunked", "embedding", "scoring"];

export default function DocumentsPage(props: PageProps<"/projects/[projectId]/documents">) {
  const { projectId } = use(props.params);
  const search = use(props.searchParams);
  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [view, setView] = useState<"matrix" | "graph">("matrix");
  const [docmap, setDocmap] = useState<DocMapData | null>(null);
  const [mapStale, setMapStale] = useState(false);
  const [newDocCount, setNewDocCount] = useState(0);
  const [mapLoading, setMapLoading] = useState(false);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [builtinCount, setBuiltinCount] = useState(4);
  const [showDimModal, setShowDimModal] = useState(false);
  const [dimDraft, setDimDraft] = useState<{ name: string; desc: string; weight: number }[]>([]);
  const [showFolded, setShowFolded] = useState(false);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [readerDoc, setReaderDoc] = useState<DocumentItem | null>(null);
  const [focusChunk, setFocusChunk] = useState<string | null>(null);
  const [scoreEdit, setScoreEdit] = useState<{
    docId: number;
    dim: string;
    score: string;
    reason: string;
  } | null>(null);
  const [scoreSaving, setScoreSaving] = useState(false);
  const pollRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const loadDocs = useCallback(async () => {
    const data = await api<{ documents: DocumentItem[] }>(
      `/api/projects/${projectId}/documents?view=matrix&sort=weighted`
    );
    setDocs(data.documents);
    useCitationMetaStore.getState().setDocs(data.documents);
    return data.documents;
  }, [projectId]);

  const loadDimensions = useCallback(async () => {
    const d = await api<{ builtin: Dimension[]; custom: Dimension[] }>(
      `/api/projects/${projectId}/score-dimensions`
    );
    setDimensions([...d.builtin, ...d.custom]);
    setBuiltinCount(d.builtin.length);
    const w: Record<string, number> = {};
    [...d.builtin, ...d.custom].forEach((x) => (w[x.key] = x.weight));
    setWeights(w);
  }, [projectId]);

  const loadGraph = useCallback(async () => {
    if (view !== "graph") return;
    setMapLoading(true);
    try {
      const res = await api<{
        map: DocMapData | null;
        stale: boolean;
        new_doc_ids: number[];
        has_cache: boolean;
      }>(`/api/projects/${projectId}/documents/docmap`);
      if (res.has_cache && res.map) {
        setDocmap(res.map);
        setMapStale(res.stale);
        setNewDocCount(res.new_doc_ids.length);
      } else {
        const graph = await api<DocMapData>(
          `/api/projects/${projectId}/documents/docmap:regenerate`,
          { method: "POST" }
        );
        setDocmap(graph);
        setMapStale(false);
        setNewDocCount(0);
      }
    } finally {
      setMapLoading(false);
    }
  }, [projectId, view]);

  const regenerateMap = useCallback(async () => {
    setMapLoading(true);
    try {
      const graph = await api<DocMapData>(
        `/api/projects/${projectId}/documents/docmap:regenerate`,
        { method: "POST" }
      );
      setDocmap(graph);
      setMapStale(false);
      setNewDocCount(0);
    } finally {
      setMapLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    api<Project>(`/api/projects/${projectId}`).then(setProject).catch(() => {});
    loadDocs().catch((e) => setError((e as Error).message));
    loadDimensions().catch(() => {});
  }, [projectId, loadDocs, loadDimensions]);

  useEffect(() => {
    const title = useDemoStore.getState().pendingOpenDocTitle;
    if (!title || docs.length === 0) return;
    const match = docs.find(
      (d) => d.status === "ready" && (d.title || "").toLowerCase().includes(title.toLowerCase())
    );
    if (match) {
      useDemoStore.getState().consumeOpenDoc();
      setReaderDoc(match);
    }
  }, [docs]);

  useEffect(() => {
    void (async () => {
      const docParam = Array.isArray(search?.doc) ? search.doc[0] : search?.doc;
      const chunkParam = Array.isArray(search?.chunk) ? search.chunk[0] : search?.chunk;
      if (!docParam || docs.length === 0) return;
      const id = Number(docParam);
      const d = docs.find((x) => x.id === id && x.status === "ready");
      if (d) {
        setReaderDoc(d);
        if (chunkParam) setFocusChunk(String(chunkParam));
      }
    })();
  }, [search, docs]);

  useEffect(() => {
    loadGraph().catch(() => {});
  }, [loadGraph]);

  useEffect(() => {
    const tick = async () => {
      try {
        const list = await loadDocs();
        const pending = list.some((d) => PENDING.includes(d.status));
        if (!pending && pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        /* ignore */
      }
    };
    pollRef.current = window.setInterval(tick, 4000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [loadDocs]);

  const startPolling = () => {
    if (pollRef.current) return;
    const tick = async () => {
      const list = await loadDocs().catch(() => null);
      if (!list) return;
      const pending = list.some((d) => PENDING.includes(d.status));
      if (!pending && pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    pollRef.current = window.setInterval(tick, 4000);
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      await apiForm(`/api/projects/${projectId}/documents:batch-import`, form);
      startPolling();
      await loadDocs();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const saveWeights = async () => {
    await api(`/api/projects/${projectId}/score-weights`, {
      method: "PUT",
      body: JSON.stringify({ weights }),
    });
    await loadDocs();
  };

  const openDimModal = () => {
    setDimDraft(
      dimensions.slice(builtinCount).map((d) => ({ name: d.name, desc: d.desc, weight: d.weight }))
    );
    setShowDimModal(true);
  };

  const saveDimensions = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/score-dimensions`, {
        method: "PUT",
        body: JSON.stringify({ custom_dims: dimDraft }),
      });
      await loadDimensions();
      setShowDimModal(false);
      const ready = docs.filter((d) => d.status === "ready");
      if (ready.length && window.confirm("维度已更新。是否对现有文献重新评分以应用新维度？")) {
        for (const d of ready) {
          await api(`/api/documents/${d.id}:rescore`, { method: "POST" }).catch(() => {});
        }
        await loadDocs();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openScoreEdit = (doc: DocumentItem, dim: string) => {
    const cell = doc.scores?.[dim];
    setScoreEdit({
      docId: doc.id,
      dim,
      score: cell ? String(cell.score) : "3",
      reason: cell?.reason || "",
    });
  };

  const saveScoreEdit = async () => {
    if (!scoreEdit || scoreSaving) return;
    const score = Number(scoreEdit.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      showToast("分数必须是 1-5 的整数");
      return;
    }
    setScoreSaving(true);
    try {
      await api(`/api/documents/${scoreEdit.docId}/scores`, {
        method: "PUT",
        body: JSON.stringify({
          scores: { [scoreEdit.dim]: score },
          reasons: { [scoreEdit.dim]: scoreEdit.reason.trim() },
        }),
      });
      showToast("评分已人工校正，校正样例将用于校准后续打分");
      setScoreEdit(null);
      await loadDocs();
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setScoreSaving(false);
    }
  };

  const editTitle = async (doc: DocumentItem) => {    const newTitle = window.prompt("修改文献标题：", doc.title || "");
    if (!newTitle || newTitle.trim() === doc.title) return;
    try {
      await api(`/api/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      showToast("标题已更新");
      await loadDocs();
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  const openDoc = (id: number) => {
    const d = docs.find((x) => x.id === id);
    if (d && d.status === "ready") setReaderDoc(d);
  };

  const visible = showFolded ? docs : docs.filter((d) => !d.folded);
  const foldedCount = docs.filter((d) => d.folded).length;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-1">
          {(
            [
              ["matrix", "评分矩阵"],
              ["graph", "文献脉络图谱"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 text-sm ${
                view === v
                  ? "bg-white font-medium text-blue-600 shadow-sm"
                  : "text-neutral-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openDimModal}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            维度管理
          </button>
          <label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            {busy ? "处理中…" : "上传文献"}
            <input type="file" accept=".pdf,.docx,.md" multiple className="hidden" onChange={onUpload} disabled={busy} />
          </label>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-5 rounded-xl border border-neutral-200 bg-white px-5 py-3">
        <span className="text-xs font-medium text-neutral-500">排序权重</span>
        {dimensions.map((d) => (
          <label key={d.key} className="flex items-center gap-2 text-xs text-neutral-600" title={d.desc}>
            {d.name}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={weights[d.key] ?? 0.25}
              onChange={(e) => setWeights({ ...weights, [d.key]: Number(e.target.value) })}
            />
            <span className="w-8 tabular-nums">{(weights[d.key] ?? 0.25).toFixed(2)}</span>
          </label>
        ))}
        <button
          onClick={saveWeights}
          className="ml-auto rounded-lg border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
        >
          应用权重
        </button>
      </div>

      {view === "matrix" && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm" style={{ minWidth: 760 + dimensions.length * 120 }}>
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                <th className="w-[300px] px-4 py-3 font-medium">文献（点击名称精读）</th>
                <th className="px-3 py-3 font-medium">状态</th>
                {dimensions.map((d) => (
                  <th key={d.key} className="px-3 py-3 text-center font-medium" title={d.desc}>
                    {d.name}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-medium">加权总分</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={3 + dimensions.length}
                    className="px-4 py-12 text-center text-neutral-400"
                  >
                    暂无文献，请上传 PDF 文件
                  </td>
                </tr>
              )}
              {visible.map((doc) => (
                <tr key={doc.id} className="border-b border-neutral-100 align-top last:border-0 hover:bg-neutral-50">
                  <td className="max-w-[300px] px-4 py-3">
                    <button
                      onClick={() => openDoc(doc.id)}
                      disabled={doc.status !== "ready"}
                      className={`block max-w-full truncate text-left text-sm font-medium ${
                        doc.status === "ready"
                          ? "text-blue-600 underline-offset-2 hover:underline"
                          : "cursor-default text-neutral-800"
                      }`}
                      title={doc.status === "ready" ? "点击进入沉浸式精读" : "入库完成后可精读"}
                    >
                      {doc.title || doc.file_name || `文档 ${doc.id}`}
                    </button>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400">
                      <span className="truncate">
                        {[doc.venue, doc.year].filter(Boolean).join(" · ")}
                        {doc.cited_by != null && ` · 被引 ${doc.cited_by}`}
                      </span>
                      <button
                        onClick={() => editTitle(doc)}
                        title="修改标题"
                        className="shrink-0 text-neutral-300 hover:text-blue-600"
                      >
                        ✎
                      </button>
                    </div>
                    {doc.error_msg && (
                      <div className="mt-1 text-xs text-red-500">{doc.error_msg}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[doc.status] || "bg-neutral-100 text-neutral-600"}`}>
                      {STATUS_LABELS[doc.status] || doc.status}
                    </span>
                  </td>
                  {dimensions.map((d) => {
                    const cell = doc.scores?.[d.key];
                    const editing = scoreEdit && scoreEdit.docId === doc.id && scoreEdit.dim === d.key;
                    return (
                      <td key={d.key} className="px-3 py-3 text-center">
                        {editing ? (
                          <div className="mx-auto w-[150px] space-y-1.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <select
                                value={scoreEdit!.score}
                                onChange={(e) =>
                                  setScoreEdit({ ...scoreEdit!, score: e.target.value })
                                }
                                className="rounded border border-blue-400 px-1.5 py-0.5 text-sm font-semibold"
                              >
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                              <span className="text-[10px] text-neutral-400">分</span>
                            </div>
                            <textarea
                              value={scoreEdit!.reason}
                              onChange={(e) =>
                                setScoreEdit({ ...scoreEdit!, reason: e.target.value })
                              }
                              placeholder="校正理由（将用于模型学习）"
                              className="w-full rounded border border-neutral-300 px-1.5 py-1 text-[10px] leading-snug focus:border-blue-500 focus:outline-none"
                              rows={2}
                            />
                            <div className="flex justify-center gap-1.5">
                              <button
                                onClick={saveScoreEdit}
                                disabled={scoreSaving}
                                className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {scoreSaving ? "保存中…" : "保存"}
                              </button>
                              <button
                                onClick={() => setScoreEdit(null)}
                                className="rounded border border-neutral-300 px-2 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-50"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : cell ? (
                          <div className="group relative">
                            <div className="font-semibold tabular-nums">
                              {cell.score}
                              {cell.user_edited && (
                                <span
                                  className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700"
                                  title="人工校正，已作为反馈样例校准模型"
                                >
                                  人工
                                </span>
                              )}
                            </div>
                            <div className="mx-auto mt-1 max-w-[130px] text-[10px] leading-snug text-neutral-400">
                              {cell.reason}
                            </div>
                            <button
                              onClick={() => openScoreEdit(doc, d.key)}
                              title="人工校正评分（记录反馈理由供模型学习）"
                              className="absolute -top-1 -right-1 hidden rounded bg-neutral-100 px-1 text-[10px] text-neutral-400 group-hover:inline hover:bg-blue-100 hover:text-blue-600"
                            >
                              ✎
                            </button>
                          </div>
                        ) : (
                          <span className="text-neutral-300">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center text-base font-bold tabular-nums">
                    {doc.weighted_score != null ? doc.weighted_score.toFixed(2) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "graph" && (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-neutral-400">
              基于文献内容聚类与学术关系梳理的知识图谱 · 点击节点进入精读 · 无新文献时直接复用缓存
            </p>
            <button
              onClick={regenerateMap}
              disabled={mapLoading}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              {mapLoading ? "梳理中…" : "重新梳理脉络"}
            </button>
          </div>
          {mapStale && docmap && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
              <span className="text-xs text-amber-800">
                有 {newDocCount} 篇新文献尚未纳入当前脉络图谱（为节省 token 未自动更新）
              </span>
              <button
                onClick={regenerateMap}
                disabled={mapLoading}
                className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {mapLoading ? "更新中…" : "更新图谱"}
              </button>
            </div>
          )}
          {mapLoading && !docmap ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-16 text-center text-sm text-neutral-400">
              正在首次生成文献脉络图谱（约 30 秒）…
            </div>
          ) : !docmap || docmap.nodes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-16 text-center text-sm text-neutral-400">
              至少需要 1 篇就绪文献才能生成脉络图
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
              <aside className="space-y-3 xl:sticky xl:top-2 xl:self-start">
                {docmap.narrative && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                    <div className="text-xs font-bold text-blue-800">文献脉络叙述</div>
                    <p className="mt-2 text-xs leading-relaxed text-neutral-600">
                      {docmap.narrative}
                    </p>
                  </div>
                )}
                {docmap.clusters.map((c) => (
                  <div key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                    <div className="text-xs font-bold text-neutral-700">{c.label}</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                      {c.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.doc_ids.map((id) => {
                        const n = docmap.nodes.find((x) => x.id === id);
                        return n ? (
                          <button
                            key={id}
                            onClick={() => openDoc(id)}
                            className="rounded-md bg-neutral-100 px-2 py-1 text-left text-[11px] text-neutral-600 hover:bg-blue-50 hover:text-blue-600"
                            title="点击精读"
                          >
                            《{n.title.length > 14 ? n.title.slice(0, 14) + "…" : n.title}》
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>
                ))}
              </aside>
              <DocMapGraph data={docmap} onOpenDoc={openDoc} />
            </div>
          )}
        </div>
      )}

      {foldedCount > 0 && view === "matrix" && (
        <button
          onClick={() => setShowFolded((v) => !v)}
          className="mt-3 text-xs text-neutral-500 hover:text-blue-600"
        >
          {showFolded ? "收起低分文献" : `展开 ${foldedCount} 篇低分文献（加权分 < 2.5，已自动折叠）`}
        </button>
      )}

      {showDimModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40" onClick={() => setShowDimModal(false)}>
          <div className="w-[560px] rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold">自定义评分维度</h2>
            <p className="mt-1 text-xs text-neutral-500">
              在内置四维之外，按你的研究需要补充至多 4 个维度（保存后可对现有文献重新评分）
            </p>
            <div className="mt-4 space-y-3">
              {dimDraft.map((d, i) => (
                <div key={i} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex gap-2">
                    <input
                      value={d.name}
                      onChange={(e) =>
                        setDimDraft(dimDraft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                      }
                      placeholder="维度名称，如：政策相关性"
                      className="w-44 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <input
                      value={d.desc}
                      onChange={(e) =>
                        setDimDraft(dimDraft.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))
                      }
                      placeholder="评分判据说明，将写入 AI 打分指令"
                      className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={() => setDimDraft(dimDraft.filter((_, j) => j !== i))}
                      className="rounded px-2 text-neutral-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
                    权重
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={d.weight}
                      onChange={(e) =>
                        setDimDraft(dimDraft.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))
                      }
                    />
                    <span className="tabular-nums">{d.weight.toFixed(2)}</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setDimDraft([...dimDraft, { name: "", desc: "", weight: 0.25 }])}
                disabled={dimDraft.length >= 4}
                className="rounded-lg border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40"
              >
                ＋ 添加维度（{dimDraft.length}/4）
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDimModal(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
                >
                  取消
                </button>
                <button
                  onClick={saveDimensions}
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? "保存中…" : "保存维度"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast.slice(0, 200)}
        </div>
      )}

      {readerDoc && (
        <ReaderOverlay
          docId={readerDoc.id}
          docTitle={readerDoc.title || readerDoc.file_name || `文档 ${readerDoc.id}`}
          focusChunk={focusChunk}
          onClose={() => {
            setReaderDoc(null);
            setFocusChunk(null);
          }}
        />
      )}
    </div>
  );
}
