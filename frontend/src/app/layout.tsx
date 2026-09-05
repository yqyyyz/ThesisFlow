import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import SettingsModal from "@/components/SettingsModal";
import NewProjectModal from "@/components/NewProjectModal";

export const metadata: Metadata = {
  title: "ThesisFlow - 一站式科研工作台",
  description: "科研协作智能体：文献管理、沉浸式精读、引用溯源写作与长效记忆",
};

export default function RootLayout(props: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full bg-neutral-50 text-neutral-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-auto">{props.children}</main>
        </div>
        <SettingsModal />
        <NewProjectModal />
      </body>
    </html>
  );
}
