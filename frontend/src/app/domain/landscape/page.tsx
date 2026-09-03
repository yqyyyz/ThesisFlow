"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import MindMap, { type MindGraph, type MindSelection } from "@/components/domain/MindMap";

interface Landscape {
  id: number;
  domain: string | null;
  content: string;
  graph: MindGraph | null;
  created_at: string;
}

export default function LandscapePage() {
  const [landscapes, setLandscapes] = useState<Landscape[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [selected, setSelected] = useState<MindSelection | null>(null);
  const [docTitles, setDocTitles] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api<{ landscapes: Landscape[] }>("/api/domain/landscapes")
      .then((d) => setLandscapes(d.landscapes))
      .catch(() => {});
    (async () => {
      const map: Record<number, string> = {};
      try {
        const p1 = await api<{ documents: { id: number; title: string | null; file_name: string | null }[] }>(
          "/api/projects/1/documents"
        );
        p1.documents.forEach((d) => (map[d.id] = d.title || d.file_name || `文档 ${d.id}`));
      } catch {
        /* ignore */
      }
      try {
        const kb = await api<{ documents: { id: number; title: string | null; file_name: string | null }[] }>(
          "/api/domain/documents"
        );
        kb.documents.forEach((d) => (map[d.id] = d.title || d.file_name || `文档 ${d.id}`));
      } catch {
        /* ignore */
      }
      setDocTitles(map);
    })();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const generate = async () => {
    setGenLoading(true);
    try {
      const res = await api<Landscape>("/api/domain/landscape:generate", { method: "POST" });
      setLandscapes((l) => [res, ...l]);
      setSelected(null);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setGenLoading(false);
    }
  };

  const latest = landscapes[0];

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">研究图景</h1>
          <p className="mt-1 text-sm text-neutral-500">
            思维导图呈现领域结构，点击节点查看该方向的研究进展解读
          </p>
        </div>
        <button
          onClick={generate}
          disabled={genLoading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {genLoading ? "生成中（约 40 秒）…" : "生成最新图景"}
        </button>
      </div>

      {!latest && !genLoading && (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 p-14 text-center text-sm text-neutral-400">
          还没有研究图景，点击右上角基于知识库与研究画像生成
        </div>
      )}

      {latest?.graph && (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <div>
            <div className="mb-2 flex items-center gap-3 text-xs text-neutral-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" /> 根节点
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-300" /> 主方向
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" /> 研究缺口（建议切入）
              </span>
              <span className="ml-auto">
                生成于 {new Date(latest.created_at).toLocaleString("zh-CN")}
              </span>
            </div>
            <MindMap graph={latest.graph} onSelect={setSelected} selected={selected} />
          </div>

          <aside className="rounded-xl border border-neutral-200 bg-white p-5 xl:sticky xl:top-4 xl:self-start">
            {!selected ? (
              <div className="py-10 text-center text-sm text-neutral-400">
                点击左侧任意节点
                <br />
                查看该研究方向的发展解读
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-neutral-800">{selected.label}</h3>
                  {selected.is_gap && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      研究缺口
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {selected.level === "root" ? "领域根节点" : selected.level === "branch" ? "主要研究方向" : "子方向"}
                </div>
                {selected.detail ? (
                  <p className="mt-3 text-sm leading-relaxed text-neutral-600">{selected.detail}</p>
                ) : (
                  <p className="mt-3 text-sm text-neutral-400">
                    {selected.level === "branch"
                      ? "点击该方向下的子节点查看具体进展解读"
                      : "点击生成以获取该节点解读"}
                  </p>
                )}
                {selected.related_doc_ids && selected.related_doc_ids.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-neutral-500">相关文献</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selected.related_doc_ids.map((id) => (
                        <span
                          key={id}
                          className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600"
                        >
                          《{docTitles[id] || `文献 ${id}`}》
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {latest && (
        <details className="mt-6 rounded-xl border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-neutral-700">
            查看完整图景报告（Markdown）
          </summary>
          <div className="prose prose-sm max-w-none border-t border-neutral-100 px-6 py-4 text-neutral-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{latest.content}</ReactMarkdown>
          </div>
        </details>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast.slice(0, 200)}
        </div>
      )}
    </div>
  );
}
