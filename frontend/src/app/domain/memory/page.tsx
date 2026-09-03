"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Memory {
  id: number;
  content: string;
  type: string;
  confidence: number;
  trigger_count: number;
  status: string;
  conflict_with: number | null;
  created_at: string;
}

interface HealthReportData {
  summary: string;
  total: number;
  flagged: { memory: Memory; reasons: string[] }[];
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newMemory, setNewMemory] = useState("");
  const [healthReport, setHealthReport] = useState<HealthReportData | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const loadMemories = useCallback(async () => {
    const d = await api<{ memories: Memory[] }>("/api/memory");
    setMemories(d.memories);
  }, []);

  useEffect(() => {
    loadMemories().catch(() => {});
  }, [loadMemories]);

  const addMemory = async () => {
    if (!newMemory.trim()) return;
    try {
      const res = await api<{ stats: { merged: number; conflicts: number; created: number } }>(
        "/api/memory",
        { method: "POST", body: JSON.stringify({ content: newMemory.trim() }) }
      );
      const s = res.stats;
      showToast(
        s.conflicts > 0 ? "已添加，检测到与既有记忆冲突，请裁决" : "已沉淀为显式记忆"
      );
      setNewMemory("");
      await loadMemories();
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const runHealthReport = async () => {
    try {
      const res = await api<HealthReportData>("/api/memory/health-report");
      setHealthReport(res);
      await loadMemories();
      showToast("健康报告已生成");
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const resolveConflict = async (id: number, resolution: string) => {
    await api(`/api/memory/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ conflict_resolution: resolution }),
    });
    await loadMemories();
    showToast("冲突已裁决");
  };

  const deleteMemory = async (id: number) => {
    await api(`/api/memory/${id}`, { method: "DELETE" });
    await loadMemories();
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">个人记忆库</h1>
          <p className="mt-1 text-sm text-neutral-500">
            系统沉淀的研究偏好与长效知识，越用越懂你的学术脉络
          </p>
        </div>
        <button
          onClick={runHealthReport}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          生成健康报告
        </button>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <input
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addMemory()}
          placeholder="显式沉淀一条研究偏好，例如：偏好使用双重差分法分析平台数据"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={addMemory}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          添加记忆
        </button>
      </div>

      {healthReport && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-medium text-amber-800">
            记忆健康报告：{healthReport.summary}
          </div>
          {healthReport.flagged.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {healthReport.flagged.map((f) => (
                <div key={f.memory.id} className="flex items-center gap-2 text-xs">
                  <span className="text-amber-700">
                    「{f.memory.content.slice(0, 40)}」— {f.reasons.join("、")}
                  </span>
                  <button
                    onClick={() =>
                      api(`/api/memory/${f.memory.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "active" }),
                      }).then(loadMemories)
                    }
                    className="text-emerald-600 hover:underline"
                  >
                    保留
                  </button>
                  <button
                    onClick={() => deleteMemory(f.memory.id)}
                    className="text-red-500 hover:underline"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {memories.length === 0 && (
          <div className="col-span-2 rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">
            暂无记忆条目。显式添加，或在写作对话中让系统自动沉淀隐式记忆
          </div>
        )}
        {memories.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-4 ${
              m.status === "pending_review"
                ? "border-amber-300 bg-amber-50"
                : "border-neutral-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-2 text-[10px]">
              <span
                className={`rounded px-1.5 py-0.5 font-medium ${
                  m.type === "explicit"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-purple-100 text-purple-700"
                }`}
              >
                {m.type === "explicit" ? "显式" : "隐式"}
              </span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500">
                置信度 {m.confidence.toFixed(2)}
              </span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500">
                触发 {m.trigger_count} 次
              </span>
              {m.status === "pending_review" && (
                <span className="rounded bg-amber-200 px-1.5 py-0.5 text-amber-800">
                  待确认
                </span>
              )}
              <button
                onClick={() => deleteMemory(m.id)}
                className="ml-auto text-neutral-300 hover:text-red-500"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 text-sm text-neutral-700">{m.content}</div>
            {m.conflict_with && (
              <div className="mt-2 flex items-center gap-2 rounded bg-red-50 p-2 text-xs text-red-700">
                与既有记忆可能冲突：
                <button
                  onClick={() => resolveConflict(m.id, "keep_new")}
                  className="font-medium hover:underline"
                >
                  保留新
                </button>
                <button
                  onClick={() => resolveConflict(m.id, "keep_old")}
                  className="font-medium hover:underline"
                >
                  保留旧
                </button>
                <button
                  onClick={() => resolveConflict(m.id, "merge")}
                  className="font-medium hover:underline"
                >
                  合并
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast.slice(0, 200)}
        </div>
      )}
    </div>
  );
}
