"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiForm } from "@/lib/api";

interface KbDoc {
  id: number;
  title: string | null;
  file_name: string | null;
  venue: string | null;
  year: number | null;
  status: string;
  error_msg: string | null;
  created_at: string;
}

export default function LibraryPage() {
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    const d = await api<{ documents: KbDoc[] }>("/api/domain/documents");
    setDocs(d.documents);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    try {
      await apiForm("/api/domain/documents", form);
      showToast("已加入知识库，后台解析中");
      setTimeout(load, 3000);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文献库</h1>
          <p className="mt-1 text-sm text-neutral-500">
            独立于项目的宏观知识沉淀池，为所有项目提供背景支撑
          </p>
        </div>
        <label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          上传文献至知识库
          <input type="file" accept=".pdf,.docx,.md" multiple className="hidden" onChange={upload} />
        </label>
      </div>

      <div className="mt-5 space-y-2">
        {docs.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">
            知识库为空，上传经典教材、核心综述等基础资料
          </div>
        )}
        {docs.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
          >
            <div>
              <div className="text-sm font-medium text-neutral-800">
                {d.title || d.file_name}
              </div>
              <div className="mt-0.5 text-xs text-neutral-400">
                {[d.venue, d.year].filter(Boolean).join(" · ")}
              </div>
              {d.error_msg && <div className="text-xs text-red-500">{d.error_msg}</div>}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                d.status === "ready"
                  ? "bg-emerald-100 text-emerald-700"
                  : d.status === "failed"
                    ? "bg-red-100 text-red-700"
                    : "bg-blue-100 text-blue-700"
              }`}
            >
              {d.status === "ready" ? "就绪" : d.status === "failed" ? "失败" : "处理中"}
            </span>
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
