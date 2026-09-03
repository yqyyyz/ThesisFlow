"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";

export default function ProjectSettingsModal({
  projectId,
  open,
  onClose,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    research_question: "",
    description: "",
    stage: "topic",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    api<Project>(`/api/projects/${projectId}`)
      .then((p) =>
        setForm({
          name: p.name,
          research_question: p.research_question || "",
          description: p.description || "",
          stage: p.stage,
        })
      )
      .catch(() => {});
  }, [open, projectId]);

  if (!open) return null;

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const updated = await api<Project>(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name.trim(),
          research_question: form.research_question.trim() || null,
          description: form.description.trim() || null,
          stage: form.stage,
        }),
      });
      onSaved(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async () => {
    await api(`/api/projects/${projectId}`, { method: "DELETE" });
    window.location.href = "/";
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[560px] rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">项目设置</h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-100"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">项目标题</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">
              研究目标 / 研究问题
              <span className="ml-2 text-xs font-normal text-neutral-400">
                用于文献相关性打分与写作上下文
              </span>
            </span>
            <textarea
              value={form.research_question}
              onChange={(e) => setForm({ ...form, research_question: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">项目描述（可选）</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">所处阶段</span>
            <select
              value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value })}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="topic">选题明晰</option>
              <option value="literature">文献整理</option>
              <option value="writing">论文写作</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-red-400 hover:text-red-600"
          >
            删除项目…
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={saving || !form.name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="text-xs text-red-700">
              将永久删除该项目及其全部文献、批注与草稿，且不可恢复。确认删除？
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-600"
              >
                取消
              </button>
              <button
                onClick={deleteProject}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                确认永久删除
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
