export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function getJson(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `请求失败（${response.status}）`);
  }
  return response.json();
}

export function categoryBadge(category) {
  if (category === "screening") return "badge-blue";
  if (category === "reading") return "badge-teal";
  return "badge-amber";
}

export function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
