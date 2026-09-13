import { categoryBadge, escapeHtml, getJson } from "/static/shared.js";

let tasks = [];
let selectedId = null;
let form = blankForm();

const selectEl = document.querySelector("#task-select");
const mainEl = document.querySelector("#review-main");
const availabilityEl = document.querySelector("#availability");
const statusLink = document.querySelector("#status-link");

function blankForm() {
  return { decision: "", confidence: "一般", answers: {}, observed_output: "", reviewer_note: "", corrected_answer: "", next_action: "" };
}

function taskOptions() {
  const groups = [
    ["screening", "文献筛选"],
    ["reading", "文献阅读"],
    ["writing", "辅助写作"],
  ];
  selectEl.innerHTML = groups.map(([category, label]) => `<optgroup label="${label}">${tasks.filter((task) => task.category === category).map((task) => `<option value="${task.id}" ${task.id === selectedId ? "selected" : ""}>${task.id} · ${escapeHtml(task.title)}${task.availability !== "现在可以审核" ? "（稍后开放）" : ""}</option>`).join("")}</optgroup>`).join("");
}

function setAnswer(key, value) {
  form.answers[key] = value;
  renderReview();
}

function choices(key) {
  const value = form.answers[key];
  return `<div class="segmented">
    <button type="button" class="choice good ${value === "符合" ? "active" : ""}" data-answer="${key}" data-value="符合">符合</button>
    <button type="button" class="choice bad ${value === "不符合" ? "active" : ""}" data-answer="${key}" data-value="不符合">不符合</button>
    <button type="button" class="choice neutral ${value === "无法判断" ? "active" : ""}" data-answer="${key}" data-value="无法判断">无法判断</button>
  </div>`;
}

function screeningDocuments(task) {
  return `<div class="review-block"><h3>逐篇判断文献处理是否正确</h3><p>如果你还没有看到产品输出，可以先打开 ThesisFlow 完成操作。</p>${task.documents.map((doc) => `<div class="check-row"><div class="check-label"><strong>${escapeHtml(doc)}</strong> 应如何处理？</div><div class="segmented">${["优先阅读", "稍后阅读", "排除", "信息不足"].map((value) => `<button type="button" class="choice neutral ${form.answers[`doc_${doc}`] === value ? "active" : ""}" data-answer="doc_${doc}" data-value="${value}">${value}</button>`).join("")}</div></div>`).join("")}</div>`;
}

function standardChecks(task) {
  return `<div class="review-block"><h3>${task.category === "reading" ? "核对论文事实" : "核对写作结果"}</h3><p>每一项都需要明确选择；无法从现有材料判断时，请选“无法判断”。</p><div class="panel"><div class="panel-body">${task.review_fields.map((field) => `<div class="check-row"><div class="check-label">${escapeHtml(field.label)}</div>${choices(field.key)}</div>`).join("")}</div></div></div>`;
}

function ragChecks(task) {
  if (task.kind !== "hybrid") return "";
  const fields = [
    ["rag_recall", "系统是否找到了回答所需的关键原文"],
    ["rag_noise", "无关材料是否控制在可接受范围"],
    ["rag_assembly", "最终回答是否实际使用了找到的正确证据"],
  ];
  return `<div class="review-block"><h3>先检查系统找到了哪些材料</h3><p>这一组判断用于区分“材料没找到”和“材料找到了但 AI 用错”两类问题。</p><div class="panel"><div class="panel-body">${fields.map(([key, label]) => `<div class="check-row"><div class="check-label">${label}</div>${choices(key)}</div>`).join("")}</div></div></div>`;
}

function decisionBlock() {
  const decisions = [
    ["通过", "结果可以保留", "good"],
    ["需要修改", "存在明确问题，修改后再检查", "neutral"],
    ["不可用", "结果不能进入科研工作", "bad"],
  ];
  return `<div class="review-block"><h3>给出最终结论</h3><p>这是你对本次产品输出的总体判断。</p><div class="decision-grid">${decisions.map(([value, hint]) => `<button type="button" class="decision ${form.decision === value ? "active" : ""}" data-decision="${value}"><strong>${value}</strong><span>${hint}</span></button>`).join("")}</div></div>`;
}

function renderReview() {
  const task = tasks.find((item) => item.id === selectedId);
  if (!task) return;
  const enabled = task.availability === "现在可以审核";
  availabilityEl.innerHTML = `<div style="margin-top:12px"><span class="badge ${enabled ? "badge-teal" : "badge-amber"}">${escapeHtml(task.availability)}</span></div>`;
  statusLink.href = `/?task=${task.id}`;
  if (!enabled) {
    mainEl.innerHTML = `<span class="badge ${categoryBadge(task.category)}">${task.category_label}</span><h2 style="margin:8px 0 0">${task.id} · ${escapeHtml(task.title)}</h2><div class="review-context">这项工作用于最后检查当前版本是否真正改善。为了避免提前看到检查重点影响调优，现在不开放填写。请先完成标记为“现在可以审核”的项目。</div>`;
    return;
  }
  mainEl.innerHTML = `
    <div class="detail-title-row"><div><span class="badge ${categoryBadge(task.category)}">${task.category_label}</span><h2>${task.id} · ${escapeHtml(task.title)}</h2><p class="detail-intro">${escapeHtml(task.review_intro)}</p></div><a class="primary-link" href="${escapeHtml(task.module_url)}" target="_blank" rel="noreferrer">打开 ThesisFlow ↗</a></div>
    <div class="review-context"><strong>请在产品中完成：</strong>${escapeHtml(task.instruction)}<br><strong>需要使用：</strong>${task.documents.map(escapeHtml).join("、")}</div>
    ${task.category === "screening" ? screeningDocuments(task) : ""}
    ${ragChecks(task)}
    ${standardChecks(task)}
    ${decisionBlock()}
    <div class="review-block"><h3>记录本次产品输出</h3><p>可直接粘贴关键输出，或简要描述发生了什么，方便 Codex 复现问题。</p><textarea id="observed-output" placeholder="粘贴模型回答、推荐理由、生成段落，或描述页面操作结果……">${escapeHtml(form.observed_output)}</textarea></div>
    <div class="review-block"><h3>指出必须修改的问题</h3><p>请写事实错误、引用问题或操作问题；没有问题可以留空。</p><textarea id="reviewer-note" placeholder="例如：把论文只在特定数据集上的结论写成了普遍规律……">${escapeHtml(form.reviewer_note)}</textarea></div>
    <div class="review-block"><h3>${task.category === "writing" ? "你认可的修改方向或参考写法" : "正确结论应该是什么"}</h3><p>这会直接成为 Codex 下一轮修改的依据。</p><textarea id="corrected-answer" placeholder="写出正确判断、应保留的边界，或你希望看到的表达……">${escapeHtml(form.corrected_answer)}</textarea></div>
    <div class="review-block"><h3>你希望优先怎么改</h3><input id="next-action" type="text" placeholder="例如：优先解决错误引用，其次调整表达" value="${escapeHtml(form.next_action)}" /></div>
    <div class="review-block"><h3>你的判断把握</h3><div class="segmented">${["高", "一般", "低"].map((value) => `<button type="button" class="choice neutral ${form.confidence === value ? "active" : ""}" data-confidence="${value}">${value}</button>`).join("")}</div></div>
    <div id="saved-banner" class="saved-banner"></div>
    <div class="save-bar"><div class="save-note">反馈只保存在本机，不会自动修改 ThesisFlow 或 Prompt。<br>保存后请回到 Codex，让我读取反馈并执行迭代。</div><button id="save-button" class="save-button" ${form.decision ? "" : "disabled"}>保存到本地</button></div>
  `;

  mainEl.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => setAnswer(button.dataset.answer, button.dataset.value)));
  mainEl.querySelectorAll("[data-decision]").forEach((button) => button.addEventListener("click", () => { form.decision = button.dataset.decision; renderReview(); }));
  mainEl.querySelectorAll("[data-confidence]").forEach((button) => button.addEventListener("click", () => { form.confidence = button.dataset.confidence; renderReview(); }));
  ["observed-output", "reviewer-note", "corrected-answer", "next-action"].forEach((id) => {
    const element = document.querySelector(`#${id}`);
    element?.addEventListener("input", () => {
      const keys = { "observed-output": "observed_output", "reviewer-note": "reviewer_note", "corrected-answer": "corrected_answer", "next-action": "next_action" };
      form[keys[id]] = element.value;
    });
  });
  document.querySelector("#save-button")?.addEventListener("click", saveFeedback);
}

async function loadFeedback() {
  form = blankForm();
  const response = await getJson(`/api/feedback/${selectedId}`);
  if (response.saved && response.feedback) {
    form = { ...blankForm(), ...response.feedback, answers: response.feedback.answers || {} };
  }
  renderReview();
}

async function saveFeedback() {
  const button = document.querySelector("#save-button");
  button.disabled = true;
  button.textContent = "正在保存…";
  try {
    const result = await getJson(`/api/feedback/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const banner = document.querySelector("#saved-banner");
    banner.textContent = `${result.message} 文件：${result.local_file}`;
    banner.classList.add("show");
    button.textContent = "已保存";
  } catch (error) {
    button.disabled = false;
    button.textContent = "重新保存";
    window.alert(`保存失败：${error.message}`);
  }
}

selectEl.addEventListener("change", async () => {
  selectedId = selectEl.value;
  window.history.replaceState(null, "", `/review?task=${selectedId}`);
  await loadFeedback();
});

getJson("/api/tasks").then(async (data) => {
  tasks = data.tasks;
  const requested = new URLSearchParams(window.location.search).get("task");
  selectedId = tasks.some((task) => task.id === requested) ? requested : tasks.find((task) => task.availability === "现在可以审核")?.id;
  taskOptions();
  await loadFeedback();
}).catch((error) => {
  mainEl.innerHTML = `<div class="error">读取失败：${escapeHtml(error.message)}</div>`;
});
