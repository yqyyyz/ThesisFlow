"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useProfileStore } from "@/stores/profile";
import { useUIStore } from "@/stores/ui";
import type { Project } from "@/lib/types";

const DOMAIN_LINKS = [
  { href: "/domain/landscape", label: "研究图景" },
  { href: "/domain/memory", label: "个人记忆库" },
  { href: "/domain/library", label: "文献库" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, fetchProfile } = useProfileStore();
  const { openSettings, openNewProject } = useUIStore();
  const [projects, setProjects] = useState<Project[]>([]);

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await api<Project[]>("/api/projects"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchProfile().catch(() => {});
    loadProjects();
    const t = window.setInterval(loadProjects, 15000);
    return () => window.clearInterval(t);
  }, [fetchProfile, loadProjects]);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold tracking-wide text-neutral-900 hover:text-blue-600"
          >
            ThesisFlow
          </Link>
        </div>
        <div className="mt-0.5 text-xs text-neutral-500">一站式科研工作台</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <section className="flex min-h-0 flex-1 flex-col border-b border-neutral-200">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <span className="text-xs font-semibold text-neutral-400">项目空间</span>
            <button
              onClick={openNewProject}
              title="新建项目"
              className="rounded-md px-1.5 py-0.5 text-sm leading-none text-blue-600 hover:bg-blue-50"
            >
              ＋
            </button>
          </div>
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2 pt-1">
            {projects.length === 0 && (
              <button
                onClick={openNewProject}
                className="w-full rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-xs text-neutral-400 hover:border-blue-300 hover:text-blue-500"
              >
                ＋ 新建第一个项目
              </button>
            )}
            {projects.map((p) => {
              const active = pathname.startsWith(`/projects/${p.id}`);
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className={`block rounded-lg px-3 py-2 transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className={`mt-0.5 text-[11px] ${active ? "text-blue-400" : "text-neutral-400"}`}>
                    {p.doc_count} 篇文献
                  </div>
                </Link>
              );
            })}
          </nav>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pb-1 pt-3">
            <Link href="/" className="text-xs font-semibold text-neutral-400 hover:text-blue-600">
              领域知识库
            </Link>
          </div>
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2 pt-1">
            {DOMAIN_LINKS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-blue-50 font-medium text-blue-700"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </section>
      </div>

      <div className="border-t border-neutral-200 px-4 py-3">
        <button
          onClick={openSettings}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-neutral-100"
          title="个人设置 · 研究画像"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {(profile?.name || "研").slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-neutral-800">
              {profile?.name || "设置研究画像"}
            </span>
            <span className="block truncate text-xs text-neutral-400">
              {profile?.discipline ? `${profile.identity} · ${profile.discipline}` : "点击完成个人设置"}
            </span>
          </span>
          <span className="ml-auto text-neutral-300">⚙</span>
        </button>
      </div>
    </aside>
  );
}
