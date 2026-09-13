import { categoryBadge, escapeHtml, formatTime, getJson } from "/static/shared.js";

let tasks = [];
let activeCategory = "all";
let selectedId = null;

const listEl = document.querySelector("#task-list");
const detailEl = document.querySelector("#detail");
const filtersEl = document.querySelector("#filters");
const summaryEl = document.querySelector("#summary");

function renderSummary(summary) {
  const cards = [
    [summary.total, "全部能力检查"],
    [summary.available, "现在可以审核"],
    [summary.reviewed, "已保存人工反馈"],
    [summary.with_results, "已有测试结果"],
  ];
  summaryEl.innerHTML = cards.map(([value, label]) => `<div class="summary-card"><div class="value">${value}</div><div class="label">${label}</div></div>`).join("");
}

function renderFilters() {
  const items = [["all", "全部"], ["screening", "文献筛选"], ["reading", "文献阅读"], ["writing", "辅助写作"]];
  filtersEl.innerHTML = items.map(([key, label]) => `<button class="filter-button ${activeCategory === key ? "active" : ""}" data-filter="${key}">${label}</button>`).join("");
  filtersEl.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    activeCategory = button.dataset.filter;
    const visible = tasks.filter((task) => activeCategory === "all" || task.category === activeCategory);
    if (!visible.some((task) => task.id === selectedId)) selectedId = visible[0]?.id ?? null;
    renderFilters();
    renderList();
    renderDetail();
  }));
}

function renderList() {
  const visible = tasks.filter((task) => activeCategory === "all" || task.category === activeCategory);
  listEl.innerHTML = visible.map((task) => {
    const result = task.result.run_count ? `${task.result.accuracy}% · ${task.result.run_count} 次` : "尚无结果";
    return `<button class="task-item ${task.id === selectedId ? "active" : ""}" data-id="${task.id}">
      <div class="task-row"><div><div class="task-id">${task.id}</div><div class="task-name">${escapeHtml(task.title)}</div></div><span class="badge ${categoryBadge(task.category)}">${task.category_label}</span></div>
      <div class="task-meta">${result}${task.feedback.saved ? " · 已保存反馈" : ""}</div>
    </button>`;
  }).join("");
  listEl.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    selectedId = button.dataset.id;
    renderList();
    renderDetail();
  }));
}

function promptMarkup(prompts) {
  if (!prompts.length) return `<div class="panel-body section-note">该项没有独立的生成 Prompt。</div>`;
  return prompts.map((prompt) => `<div class="prompt-card">
    <button class="prompt-toggle" type="button"><div><div class="prompt-name">${escapeHtml(prompt.id)}</div><div class="prompt-meta">版本 ${escapeHtml(prompt.version)} · ${escapeHtml(prompt.notes)} · 来源 ${escapeHtml(prompt.source)}</div></div><span>展开 ▾</span></button>
    <div class="prompt-content"><div class="section-note" style="margin:2px 0 7px">System Prompt</div><pre>${escapeHtml(prompt.system_template)}</pre><div class="section-note" style="margin:13px 0 7px">User Prompt / 调用模板</div><pre>${escapeHtml(prompt.template)}</pre></div>
  </div>`).join("");
}

function renderDetail() {
  const task = tasks.find((item) => item.id === selectedId);
  if (!task) { detailEl.innerHTML = `<div class="empty">请选择一项工作</div>`; return; }
  const accuracy = task.result.accuracy === null ? "—" : `${task.result.accuracy}%`;
  const progress = task.result.accuracy ?? 0;
  const ragSection = task.rag_rules.length ? `<section class="section"><div class="section-head"><h3>当前检索与证据规则</h3><span class="section-note">这些属于 RAG 流程，不是 Prompt 文案</span></div><div class="panel"><div class="rule-list">${task.rag_rules.map((rule, index) => `<div class="rule"><span class="rule-number">${index + 1}</span><span>${escapeHtml(rule)}</span></div>`).join("")}</div></div></section>` : "";
  detailEl.innerHTML = `
    <div class="detail-title-row"><div><span class="badge ${categoryBadge(task.category)}">${task.category_label}</span><h2>${task.id} · ${escapeHtml(task.title)}</h2><p class="detail-intro">${escapeHtml(task.review_intro)}</p></div><a class="primary-link" href="/review?task=${task.id}">去人工审核 →</a></div>
    <div class="info-strip"><div class="info-cell"><div class="info-label">对应产品位置</div><div class="info-value">${escapeHtml(task.module)}</div></div><div class="info-cell"><div class="info-label">当前阶段</div><div class="info-value">${escapeHtml(task.availability)}</div></div><div class="info-cell"><div class="info-label">人工反馈</div><div class="info-value">${task.feedback.saved ? `已保存 · ${formatTime(task.feedback.saved_at)}` : "尚未保存"}</div></div></div>
    <section class="section"><div class="section-head"><h3>这项工作要检查什么</h3><span class="section-note">涉及文献：${task.documents.map(escapeHtml).join("、")}</span></div><div class="panel"><div class="panel-body"><div class="instruction">${escapeHtml(task.instruction)}</div><div class="document-pills">${task.documents.map((doc) => `<span class="badge badge-neutral">${escapeHtml(doc)}</span>`).join("")}</div></div></div></section>
    <section class="section"><div class="section-head"><h3>目前测得怎样</h3><span class="section-note">主要观察：${escapeHtml(task.result.metric)}</span></div><div class="panel result-card"><div><div class="score">${accuracy} <small>通过率</small></div><div class="progress"><span style="width:${progress}%"></span></div></div><div class="result-copy"><strong>${escapeHtml(task.result.status)}</strong><p>${escapeHtml(task.result.explanation)} 已通过 ${task.result.passed_count} / ${task.result.run_count || 0} 次。</p></div></div></section>
    <section class="section"><div class="section-head"><h3>当前 Prompt</h3><span class="section-note">只读 · 工作台不会在这里改 Prompt</span></div><div class="panel">${promptMarkup(task.prompts)}</div></section>
    ${ragSection}
  `;
  detailEl.querySelectorAll(".prompt-toggle").forEach((button) => button.addEventListener("click", () => button.closest(".prompt-card").classList.toggle("open")));
}

getJson("/api/tasks").then((data) => {
  tasks = data.tasks;
  selectedId = new URLSearchParams(window.location.search).get("task") || tasks[0]?.id || null;
  renderSummary(data.summary);
  renderFilters();
  renderList();
  renderDetail();
}).catch((error) => {
  listEl.innerHTML = `<div class="error">读取失败：${escapeHtml(error.message)}</div>`;
});
