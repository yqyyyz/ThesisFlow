"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useUIStore } from "@/stores/ui";
import type { Project } from "@/lib/types";

export default function NewProjectModal() {
  const { newProjectOpen, closeNewProject } = useUIStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [rq, setRq] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!newProjectOpen) return null;

  const create = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const p = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          research_question: rq.trim() || null,
        }),
      });
      setName("");
      setRq("");
      closeNewProject();
      router.refresh();
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
      onClick={closeNewProject}
    >
      <div
        className="w-[520px] rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">新建项目空间</h2>
          <button
            onClick={closeNewProject}
            className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-100"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">项目名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：平台治理中的算法偏见研究"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">研究问题（可选）</span>
            <textarea
              value={rq}
              onChange={(e) => setRq(e.target.value)}
              rows={3}
              placeholder="用一句话描述核心研究问题，将用于文献打分相关性校准与写作上下文"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>
        {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={closeNewProject}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            取消
          </button>
          <button
            onClick={create}
            disabled={submitting || !name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "创建中…" : "创建并进入"}
          </button>
        </div>
      </div>
    </div>
  );
}
