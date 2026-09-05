"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useProfileStore } from "@/stores/profile";
import { useUIStore } from "@/stores/ui";

const FIELDS: [key: string, label: string][] = [
  ["name", "姓名"],
  ["identity", "学术身份（如：博士生 / 助理教授 / 独立研究员）"],
  ["discipline", "核心研究领域"],
  ["sub_discipline", "子领域"],
  ["citation_style", "引用规范（APA / MLA / 芝加哥）"],
  ["language_pref", "写作语言（中文 / 英文）"],
];

export default function SettingsModal() {
  const { settingsOpen, closeSettings } = useUIStore();
  const { profile, fetchProfile, updateProfile } = useProfileStore();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetToast, setResetToast] = useState<string | null>(null);

  useEffect(() => {
    if (settingsOpen && profile) {
      setForm({
        name: profile.name,
        identity: profile.identity,
        discipline: profile.discipline,
        sub_discipline: profile.sub_discipline,
        citation_style: profile.citation_style,
        language_pref: profile.language_pref,
      });
    }
  }, [settingsOpen, profile]);

  if (!settingsOpen) return null;

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile(form);
      await fetchProfile();
      setToast("研究画像已保存，将注入所有 AI 会话上下文");
      setTimeout(() => {
        setToast(null);
        closeSettings();
      }, 1200);
    } finally {
      setSaving(false);
    }
  };

  const resetDemo = async () => {
    if (
      !window.confirm(
        "重置演示数据？将恢复到种子状态（文献/记忆/图谱保留，清除演示中产生的批注与草稿）"
      )
    )
      return;
    setResetting(true);
    try {
      await api("/api/admin/demo-reset", { method: "POST" });
      setResetToast("演示数据已重置");
      window.location.href = "/";
    } catch (e) {
      setResetToast(`重置失败：${(e as Error).message}`);
      setResetting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
      onClick={closeSettings}
    >
      <div
        className="w-[520px] rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">个人设置 · 研究画像</h2>
          <button
            onClick={closeSettings}
            className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-100"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          你的学术身份与偏好将作为全局 System Prompt 的底层上下文，注入每一次 AI 会话
        </p>
        <div className="mt-4 space-y-3">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="font-medium text-neutral-700">{label}</span>
              <input
                value={form[key] ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={closeSettings}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
        {toast && (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {toast}
          </div>
        )}
        <div className="mt-5 border-t border-neutral-100 pt-4">
          <div className="text-sm font-bold text-neutral-800">演示数据</div>
          <p className="mt-1 text-xs text-neutral-500">
            将数据恢复到种子状态：文献、记忆与图谱保留，清除演示过程中产生的批注与草稿（不重跑 AI 任务，秒级完成）
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={resetDemo}
              disabled={resetting}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {resetting ? "重置中…" : "重置演示数据"}
            </button>
            {resetToast && (
              <span
                className={`text-xs ${resetToast.includes("失败") ? "text-red-600" : "text-emerald-700"}`}
              >
                {resetToast}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
