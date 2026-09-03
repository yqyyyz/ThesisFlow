export interface Project {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  research_question: string | null;
  stage: string;
  created_at: string;
  doc_count: number;
}

export interface DocumentItem {
  id: number;
  project_id: number | null;
  file_name: string | null;
  doi: string | null;
  title: string | null;
  authors: string[] | null;
  venue: string | null;
  year: number | null;
  cited_by: number | null;
  status: string;
  error_msg: string | null;
  scores: Record<string, { score: number; reason: string; user_edited?: boolean }> | null;
  weighted_score: number | null;
  summary_cache: string | null;
  created_at: string;
  folded?: boolean;
}

export const STAGE_LABELS: Record<string, string> = {
  topic: "选题明晰",
  literature: "文献整理",
  writing: "论文写作",
};

export const STATUS_LABELS: Record<string, string> = {
  uploaded: "已上传",
  dedup_checked: "去重检查",
  parsing: "解析中",
  chunked: "切片完成",
  embedding: "向量化中",
  scoring: "评分中",
  ready: "就绪",
  failed: "失败",
};

export const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-neutral-100 text-neutral-600",
  dedup_checked: "bg-neutral-100 text-neutral-600",
  parsing: "bg-blue-100 text-blue-700",
  chunked: "bg-blue-100 text-blue-700",
  embedding: "bg-indigo-100 text-indigo-700",
  scoring: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};
