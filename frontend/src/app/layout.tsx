import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import SettingsModal from "@/components/SettingsModal";
import NewProjectModal from "@/components/NewProjectModal";

export const metadata: Metadata = {
  title: "ThesisFlow - AI 文献与写作工作台",
  description: "支持文献筛选、沉浸式精读与可控人机协作写作",
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
