"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import ProjectSettingsModal from "./ProjectSettingsModal";

const TABS = [
  { suffix: "/documents", label: "文献工作台" },
  { suffix: "/writing", label: "写作工作台" },
];

export default function ProjectShell({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [project, setProject] = useState<Project | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    api<Project>(`/api/projects/${projectId}`)
      .then(setProject)
      .catch(() => {});
  }, [projectId]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-neutral-200 bg-white px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-bold text-neutral-900">
              {project?.name || "加载中…"}
            </h1>
            <button
              onClick={() => setSettingsOpen(true)}
              title="项目设置（标题 / 研究目标 / 阶段）"
              className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>
          {project?.research_question && (
            <div className="mt-0.5 max-w-[520px] truncate text-xs text-neutral-400">
              {project.research_question}
            </div>
          )}
        </div>
        <nav className="ml-auto flex gap-1 rounded-lg bg-neutral-100 p-1">
          {TABS.map((t) => {
            const active = pathname.includes(t.suffix);
            return (
              <Link
                key={t.suffix}
                href={`/projects/${projectId}${t.suffix}`}
                className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-white font-medium text-blue-600 shadow-sm"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      <ProjectSettingsModal
        projectId={projectId}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={setProject}
      />
    </div>
  );
}
