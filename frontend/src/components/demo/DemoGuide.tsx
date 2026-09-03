"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DEMO_STAGES, type DemoAction } from "@/lib/demoScript";
import { useDemoStore } from "@/stores/demo";

export default function DemoGuide() {
  const router = useRouter();
  const { demoActive, stage, expanded, setStage, setExpanded, requestOpenDoc, requestMode } =
    useDemoStore();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!demoActive || projectId) return;
    api<{ id: number; name: string }[]>("/api/projects")
      .then((list) => {
        const demo = list.find((p) => p.name.includes("长上下文")) || list[0];
        if (demo) setProjectId(String(demo.id));
      })
      .catch(() => {});
  }, [demoActive, projectId]);

  if (!demoActive) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const resolvePath = (path?: string) => {
    if (!path || !projectId) return null;
    return path.replace("/projects/demo", `/projects/${projectId}`);
  };

  const runAction = async (action: DemoAction) => {
    switch (action.kind) {
      case "goto": {
        const p = resolvePath(action.path);
        if (p) router.push(p);
        break;
      }
      case "openDoc": {
        const p = resolvePath("/projects/demo/documents");
        if (action.docTitle) requestOpenDoc(action.docTitle);
        if (p) router.push(p);
        break;
      }
      case "setMode": {
        if (!projectId) {
          showToast("项目未就绪");
          return;
        }
        if (action.mode) requestMode(action.mode);
        router.push(`/projects/${projectId}/writing`);
        break;
      }
      case "copy": {
        if (action.copyText) {
          try {
            await navigator.clipboard.writeText(action.copyText);
            showToast("已复制，粘贴到对话框使用");
          } catch {
            showToast("复制失败，请手动复制");
          }
        }
        break;
      }
      case "reset": {
        if (!window.confirm("重置演示数据？将恢复到种子状态（文献/记忆/图谱保留，清除演示中产生的批注与草稿）")) return;
        try {
          await api("/api/admin/demo-reset", { method: "POST" });
          showToast("演示数据已重置");
          window.location.href = "/";
        } catch (e) {
          showToast(`重置失败：${(e as Error).message}`);
        }
        break;
      }
    }
  };

  const current = DEMO_STAGES.find((s) => s.id === stage) || DEMO_STAGES[0];

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-6 right-6 z-[90] rounded-full bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-violet-700"
      >
        🎬 演示引导（阶段 {stage}/6）
      </button>
    );
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[90] w-[380px] rounded-2xl border border-violet-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between rounded-t-2xl bg-violet-600 px-4 py-2.5">
          <div className="text-sm font-bold text-white">🎬 演示模式 · 阶段 {stage}/6</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="rounded px-1.5 text-violet-200 hover:text-white"
              title="折叠"
            >
              ─
            </button>
            <button
              onClick={() => useDemoStore.getState().exitDemo()}
              className="rounded px-1.5 text-violet-200 hover:text-white"
              title="退出演示模式"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-neutral-100 px-3 py-2">
          {DEMO_STAGES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStage(s.id)}
              className={`h-1.5 flex-1 rounded-full transition ${
                s.id === stage
                  ? "bg-violet-600"
                  : s.id < stage
                    ? "bg-violet-300"
                    : "bg-neutral-200"
              }`}
              title={`阶段 ${s.id}：${s.name}`}
            />
          ))}
        </div>

        <div className="max-h-[380px] overflow-y-auto px-4 py-3">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-bold text-neutral-800">{current.name}</div>
            <div className="text-[10px] text-neutral-400">{current.duration}</div>
          </div>
          <ol className="mt-2 space-y-2">
            {current.steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-neutral-600">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            {current.actions.map((a, i) => (
              <button
                key={i}
                onClick={() => runAction(a)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  a.kind === "reset"
                    ? "border border-red-200 text-red-600 hover:bg-red-50"
                    : "bg-violet-600 text-white hover:bg-violet-700"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-2">
          <button
            onClick={() => setStage(Math.max(1, stage - 1))}
            disabled={stage === 1}
            className="rounded-lg border border-neutral-200 px-3 py-1 text-xs text-neutral-600 disabled:opacity-40"
          >
            ← 上一阶段
          </button>
          <button
            onClick={() => setStage(Math.min(6, stage + 1))}
            disabled={stage === 6}
            className="rounded-lg bg-neutral-800 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            下一阶段 →
          </button>
        </div>
      </div>
      {toast && (
        <div className="pointer-events-none fixed bottom-24 right-6 z-[95] rounded-lg bg-neutral-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
