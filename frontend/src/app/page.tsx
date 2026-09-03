"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Insight {
  id: number;
  type: string;
  title: string;
  content: string;
  ref_doc_id: number | null;
  created_at: string;
}

interface ProjectSummary {
  project_id: number;
  name: string;
  stage: string;
  research_question: string | null;
  text: string;
  metrics: {
    doc_total: number;
    doc_ready: number;
    avg_score: number | null;
    annotations: number;
    draft_words: number;
  };
}

const STAGE_LABELS: Record<string, string> = {
  topic: "选题明晰",
  literature: "文献整理",
  writing: "论文写作",
};

export default function HomePage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ins, sums] = await Promise.all([
        api<{ insights: Insight[] }>("/api/home/insights"),
        api<{ projects: ProjectSummary[] }>("/api/home/project-summaries"),
      ]);
      setInsights(ins.insights);
      setSummaries(sums.projects);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mine = async () => {
    setMining(true);
    try {
      const res = await api<{ created: number; message?: string }>(
        "/api/home/insights:refresh",
        { method: "POST" }
      );
      showToast(res.created > 0 ? `已挖掘 ${res.created} 条知识更新` : res.message || "暂无可挖掘内容");
      await load();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setMining(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-bold">你好，欢迎回到 ThesisFlow</h1>
      <p className="mt-1 text-sm text-neutral-500">一站式科研工作台</p>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-700">领域知识挖掘</h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              知识库新增文献后，AI 自动提炼它为你的领域带来的新知识
            </p>
          </div>
          <button
            onClick={mine}
            disabled={mining}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {mining ? "挖掘中…" : "重新挖掘"}
          </button>
        </div>
        <div className="mt-3 space-y-2.5">
          {loading && (
            <div className="animate-pulse space-y-2">
              <div className="h-16 rounded-xl bg-neutral-100" />
              <div className="h-16 rounded-xl bg-neutral-100" />
            </div>
          )}
          {!loading && insights.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
              暂无知识更新。先在「领域知识库 → 文献库」上传资料，
              入库完成后 AI 会自动挖掘知识增量，也可点击右上角手动挖掘
            </div>
          )}
          {insights.map((ins) => (
            <div key={ins.id} className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm">
                ✦
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-800">{ins.title}</span>
                  <span className="text-[10px] text-neutral-400">
                    {new Date(ins.created_at).toLocaleString("zh-CN")}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{ins.content}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-700">项目进展</h2>
            <p className="mt-0.5 text-xs text-neutral-400">AI 基于文献、批注与写作数据生成的进展摘要</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          {!loading && summaries.length === 0 && (
            <div className="col-span-2 rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">
              还没有项目，点击左侧「＋」新建项目空间
            </div>
          )}
          {summaries.map((p) => (
            <Link
              key={p.project_id}
              href={`/projects/${p.project_id}`}
              className="block rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="truncate font-semibold text-neutral-800">{p.name}</div>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500">
                  {STAGE_LABELS[p.stage] || p.stage}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-600">
                  文献 {p.metrics.doc_ready}/{p.metrics.doc_total}
                </span>
                {p.metrics.avg_score != null && (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-600">
                    均分 {p.metrics.avg_score}
                  </span>
                )}
                <span className="rounded bg-purple-50 px-2 py-0.5 text-purple-600">
                  批注 {p.metrics.annotations}
                </span>
                <span className="rounded bg-orange-50 px-2 py-0.5 text-orange-600">
                  草稿 {p.metrics.draft_words} 字
                </span>
              </div>
              <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-neutral-600">
                {p.text}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast.slice(0, 200)}
        </div>
      )}
    </div>
  );
}
