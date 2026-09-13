import { categoryBadge, escapeHtml, getJson } from "/static/shared.js";

let tasks = [];
let selectedId = null;
let form = blankForm();
let outputData = { connected: false, status: "正在读取", message: "", outputs: [] };
let selectedOutputId = null;

const selectEl = document.querySelector("#task-select");
const mainEl = document.querySelector("#review-main");
const availabilityEl = document.querySelector("#availability");
const statusLink = document.querySelector("#status-link");

function blankForm() {
  return { decision: "", confidence: "一般", answers: {}, observed_output: "", output_ref: {}, reviewer_note: "", corrected_answer: "", next_action: "" };
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

const SCREENING_METRICS = [
  ["quality", "研究质量", "只根据会议/期刊、引用和正文完整性判断；资料缺失时应保留为“无法判断”，不能凭印象补分。"],
  ["relevance", "问题相关性", "看它是否直接回答长上下文管理问题，不要因为标题出现“长上下文”就默认高分。"],
  ["methodology", "方法可信度", "核对任务设计、对照实验、消融和可复现信息是否足以支撑评分。"],
  ["novelty", "创新性", "区分新方法、新评测与既有方法的新实证结果，理由要说明新在哪里。"],
];

function parseScreeningOutput(raw) {
  const cleaned = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch (_) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) { return null; }
    }
    return null;
  }
}

function promptDocumentTitle(output) {
  const match = String(output.user_prompt || "").match(/(?:文献元数据：\s*)?(?:标题|文献标题)[：:]\s*([^\n]+)/);
  return match?.[1]?.trim() || "未识别文献";
}

function normalizedTitle(value) {
  return String(value || "").toLowerCase().replace(/-\s+/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function documentIdentity(task, output) {
  const title = promptDocumentTitle(output);
  const normalized = normalizedTitle(title);
  const detail = (task.document_details || []).find((item) =>
    normalized.includes(normalizedTitle(item.title).slice(0, 24)) ||
    normalizedTitle(item.title).includes(normalized.slice(0, 24))
  );
  return { id: detail?.id || "文献", title: detail?.title || title };
}

function orderedScreeningOutputs(task) {
  const order = new Map((task.document_details || []).map((item, index) => [item.id, index]));
  return [...(outputData.outputs || [])].sort((a, b) => {
    const aIndex = order.get(documentIdentity(task, a).id) ?? 999;
    const bIndex = order.get(documentIdentity(task, b).id) ?? 999;
    return aIndex - bIndex;
  });
}

function screeningReviews() {
  if (!form.answers.screening_output_reviews) form.answers.screening_output_reviews = {};
  return form.answers.screening_output_reviews;
}

function ensureScreeningReview(task, output) {
  const reviews = screeningReviews();
  const key = output.prompt_call_id;
  if (!reviews[key]) {
    const parsed = parseScreeningOutput(output.output) || {};
    const identity = documentIdentity(task, output);
    reviews[key] = {
      document_id: identity.id,
      document_title: identity.title,
      metrics: Object.fromEntries(SCREENING_METRICS.map(([metric]) => [metric, {
        verdict: "",
        score: parsed[metric]?.score == null ? "" : String(parsed[metric].score),
        reason: parsed[metric]?.reason || "",
      }])),
      recommendation: {
        verdict: "",
        status: "",
        reason: parsed.reading_recommendation?.reason || "",
      },
    };
  }
  return reviews[key];
}

function screeningProgress(task) {
  const outputs = orderedScreeningOutputs(task);
  const required = outputs.length * (SCREENING_METRICS.length + 1);
  const done = outputs.reduce((count, output) => {
    const review = ensureScreeningReview(task, output);
    return count + SCREENING_METRICS.filter(([metric]) => review.metrics[metric].verdict).length + (review.recommendation.verdict && review.recommendation.status ? 1 : 0);
  }, 0);
  return { done, required };
}

function verdictSelect(path, value) {
  return `<select class="inline-select verdict-select" data-screening-path="${escapeHtml(path)}"><option value="">请核对…</option>${["确认无误", "已修改", "无法判断"].map((item) => `<option value="${item}" ${value === item ? "selected" : ""}>${item}</option>`).join("")}</select>`;
}

function scoreSelect(path, value) {
  return `<select class="inline-select score-select" data-screening-path="${escapeHtml(path)}"><option value="" ${value === "" ? "selected" : ""}>无法判断</option>${[1, 2, 3, 4, 5].map((score) => `<option value="${score}" ${String(value) === String(score) ? "selected" : ""}>${score} 分</option>`).join("")}</select>`;
}

function screeningOutputBlock(task, output) {
  const parsed = parseScreeningOutput(output.output);
  if (!parsed) return `<div class="output-empty">这条结果无法解析成评分表。<details><summary>查看原始输出</summary><pre>${escapeHtml(output.output)}</pre></details></div>`;
  const review = ensureScreeningReview(task, output);
  const identity = documentIdentity(task, output);
  const rows = SCREENING_METRICS.map(([metric, label, guide]) => {
    const modelValue = parsed[metric] || {};
    const humanValue = review.metrics[metric];
    return `<tr>
      <th scope="row"><strong>${label}</strong><span>${guide}</span></th>
      <td><div class="model-score">${modelValue.score == null ? "未评分" : `${escapeHtml(modelValue.score)} 分`}</div><p>${escapeHtml(modelValue.reason || "未提供理由")}</p></td>
      <td><div class="edit-line">${verdictSelect(`metrics.${metric}.verdict`, humanValue.verdict)}${scoreSelect(`metrics.${metric}.score`, humanValue.score)}</div><textarea class="table-textarea" data-screening-path="metrics.${metric}.reason" aria-label="${label}人工修正理由">${escapeHtml(humanValue.reason)}</textarea></td>
    </tr>`;
  }).join("");
  const modelRecommendation = parsed.reading_recommendation || {};
  return `<div class="structured-output">
    <div class="document-heading"><div><span class="doc-code">${escapeHtml(identity.id)}</span><h4>${escapeHtml(identity.title)}</h4></div><span class="model-chip">${escapeHtml(output.model || "未知模型")}</span></div>
    <div class="audit-callout"><strong>审核方法</strong><span>先读“怎么核对”，再对照论文摘要和元数据。模型正确就选“确认无误”；不正确时直接改右侧分数或理由，并选“已修改”。</span></div>
    <div class="audit-table-wrap"><table class="audit-table"><thead><tr><th>指标与核对方法</th><th>模型结果（保留）</th><th>你的确认或修正</th></tr></thead><tbody>${rows}
      <tr class="recommendation-row"><th scope="row"><strong>阅读优先级</strong><span>不要单看分数。结合研究问题和“首轮只读 3 篇”的预算，判断这篇是否应进入首轮。</span></th>
      <td><div class="model-score">${escapeHtml(modelRecommendation.status || "未提供")}</div><p>${escapeHtml(modelRecommendation.reason || "未提供理由")}</p></td>
      <td><div class="edit-line">${verdictSelect("recommendation.verdict", review.recommendation.verdict)}<select class="inline-select priority-select" data-screening-path="recommendation.status"><option value="">请选优先级…</option>${["首轮必读", "第二轮", "排除", "信息不足"].map((item) => `<option value="${item}" ${review.recommendation.status === item ? "selected" : ""}>${item}</option>`).join("")}</select></div><textarea class="table-textarea" data-screening-path="recommendation.reason" aria-label="阅读优先级人工修正理由">${escapeHtml(review.recommendation.reason)}</textarea></td></tr>
    </tbody></table></div>
    <details class="trace-details"><summary>查看本次 System Prompt、User Prompt 和原始输出</summary><div class="detail-stack"><div class="output-label">System Prompt</div><pre>${escapeHtml(output.system_prompt || "无")}</pre><div class="output-label">User Prompt</div><pre>${escapeHtml(output.user_prompt || "无")}</pre><div class="output-label">原始输出</div><pre>${escapeHtml(output.output)}</pre><div class="output-label">上下文记录</div><pre>${escapeHtml(JSON.stringify(output.context_manifest || {}, null, 2))}</pre></div></details>
  </div>`;
}

function screeningPortfolio(task) {
  const outputs = orderedScreeningOutputs(task);
  if (!outputs.length) return "";
  const reviews = outputs.map((output) => [output, ensureScreeningReview(task, output)]);
  const firstRound = reviews.filter(([, review]) => review.recommendation.status === "首轮必读").length;
  const progress = screeningProgress(task);
  return `<div class="review-block portfolio-block"><div class="section-head"><div><h3>最后比较五篇文献</h3><p>本任务的阅读预算是 3 篇。单篇判断完后，在这里确认最终队列。</p></div><div class="budget-counter ${firstRound === 3 ? "complete" : ""}"><strong>${firstRound} / 3</strong><span>首轮必读</span></div></div>
    <div class="portfolio-table-wrap"><table class="portfolio-table"><thead><tr><th>文献</th><th>你确认的优先级</th><th>审核进度</th></tr></thead><tbody>${reviews.map(([output, review]) => {
      const done = SCREENING_METRICS.filter(([metric]) => review.metrics[metric].verdict).length + (review.recommendation.verdict && review.recommendation.status ? 1 : 0);
      return `<tr><td><strong>${escapeHtml(review.document_id)}</strong><span>${escapeHtml(review.document_title)}</span></td><td><select class="inline-select" data-portfolio-output="${escapeHtml(output.prompt_call_id)}"><option value="">请选优先级…</option>${["首轮必读", "第二轮", "排除", "信息不足"].map((item) => `<option value="${item}" ${review.recommendation.status === item ? "selected" : ""}>${item}</option>`).join("")}</select></td><td><span class="progress-text ${done === 5 ? "complete" : ""}">${done} / 5 项已核对</span></td></tr>`;
    }).join("")}</tbody></table></div><div class="review-progress"><span>总进度：${progress.done} / ${progress.required} 项</span><span>${firstRound === 3 ? "阅读预算已满足" : "请将“首轮必读”调整为 3 篇"}</span></div></div>`;
}

function standardChecks(task) {
  const headings = { screening: "核对总体推荐", reading: "核对论文事实", writing: "核对写作结果" };
  return `<div class="review-block"><h3>${headings[task.category]}</h3><p>每一项都需要明确选择；无法从现有材料判断时，请选“无法判断”。</p><div class="panel"><div class="panel-body">${task.review_fields.map((field) => `<div class="check-row"><div class="check-label">${escapeHtml(field.label)}</div>${choices(field.key)}</div>`).join("")}</div></div></div>`;
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

function chooseOutput(promptCallId) {
  const output = outputData.outputs.find((item) => item.prompt_call_id === promptCallId);
  if (!output) return;
  selectedOutputId = promptCallId;
  form.observed_output = output.output;
  form.output_ref = {
    prompt_call_id: output.prompt_call_id,
    created_at: output.created_at,
    stage: output.stage,
    model: output.model,
    prompt_template_id: output.prompt_template_id,
    prompt_template_version: output.prompt_template_version,
  };
  renderReview();
}

function outputBlock(task) {
  const outputs = outputData.outputs || [];
  const selected = outputs.find((item) => item.prompt_call_id === selectedOutputId);
  const storedOnly = !selected && form.output_ref?.prompt_call_id && form.observed_output;
  const reference = task.reference_standard
    ? `<pre class="reference-copy">${escapeHtml(task.reference_standard)}</pre>`
    : `<div class="output-empty">这项工作的参考标准尚未准备完成。你仍可根据论文原文审核，但建议先让 Codex 补齐核对依据。</div>`;
  if (!selected && !storedOnly) {
    return `<div class="review-block output-review"><div class="section-head"><div><h3>当前模型输出</h3><p>${escapeHtml(outputData.message || "正在读取运行记录…")}</p></div><button id="refresh-output" class="secondary-link" type="button">刷新结果</button></div><div class="output-wait"><strong>${escapeHtml(outputData.status)}</strong><span>这里不会要求你复制粘贴。由 Codex 运行该项测试后，输出会自动出现。</span></div></div>`;
  }
  const currentOutput = selected?.output || form.observed_output;
  const currentRef = selected || form.output_ref;
  if (task.category === "screening" && selected) {
    const ordered = orderedScreeningOutputs(task);
    return `<div class="review-block output-review screening-review"><div class="section-head"><div><h3>逐篇核对模型评分</h3><p>切换文献，在表格右侧直接确认或修正。模型原始结果始终保留。</p></div><button id="refresh-output" class="secondary-link" type="button">刷新结果</button></div>
      <div class="output-tabs document-tabs">${ordered.map((item) => { const identity = documentIdentity(task, item); return `<button type="button" class="choice ${item.prompt_call_id === selectedOutputId ? "active neutral" : ""}" data-output-id="${escapeHtml(item.prompt_call_id)}"><strong>${escapeHtml(identity.id)}</strong><span>${escapeHtml(identity.title)}</span></button>`; }).join("")}</div>
      ${screeningOutputBlock(task, selected)}
    </div>`;
  }
  return `<div class="review-block output-review"><div class="section-head"><div><h3>直接审核当前模型输出</h3><p>${escapeHtml(outputData.message)}</p></div><button id="refresh-output" class="secondary-link" type="button">刷新结果</button></div>
    ${outputs.length > 1 ? `<div class="output-tabs">${outputs.slice(0, 8).map((item, index) => `<button type="button" class="choice ${item.prompt_call_id === selectedOutputId ? "active neutral" : ""}" data-output-id="${escapeHtml(item.prompt_call_id)}">输出 ${index + 1} · ${escapeHtml(item.stage || "模型调用")}</button>`).join("")}</div>` : ""}
    <div class="output-grid"><div class="output-column"><div class="output-label">模型实际输出</div><div class="output-meta">${escapeHtml(currentRef.model || "未知模型")} · ${escapeHtml(currentRef.prompt_template_id || currentRef.stage || "未标记 Prompt")} · ${currentRef.latency_ms ? `${currentRef.latency_ms} ms` : "已记录"}</div><pre class="model-output">${escapeHtml(currentOutput)}</pre>
      ${selected ? `<details><summary>查看本次实际 Prompt 与上下文</summary><div class="detail-stack"><div class="output-label">System Prompt</div><pre>${escapeHtml(selected.system_prompt || "无")}</pre><div class="output-label">User Prompt</div><pre>${escapeHtml(selected.user_prompt || "无")}</pre><div class="output-label">上下文记录</div><pre>${escapeHtml(JSON.stringify(selected.context_manifest || {}, null, 2))}</pre></div></details>` : ""}
    </div><div class="output-column"><div class="output-label">人工核对依据</div>${reference}</div></div></div>`;
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
    <div class="detail-title-row"><div><span class="badge ${categoryBadge(task.category)}">${task.category_label}</span><h2>${task.id} · ${escapeHtml(task.title)}</h2><p class="detail-intro">${escapeHtml(task.review_intro)}</p></div></div>
    <div class="review-context"><strong>本项检查目标：</strong>${escapeHtml(task.instruction)}<br><strong>涉及材料：</strong>${task.documents.map(escapeHtml).join("、")}</div>
    ${outputBlock(task)}
    ${task.category === "screening" ? screeningPortfolio(task) : ""}
    ${ragChecks(task)}
    ${task.category === "screening" ? "" : standardChecks(task)}
    ${decisionBlock()}
    <div class="review-block"><h3>指出必须修改的问题</h3><p>请写事实错误、引用问题或操作问题；没有问题可以留空。</p><textarea id="reviewer-note" placeholder="例如：把论文只在特定数据集上的结论写成了普遍规律……">${escapeHtml(form.reviewer_note)}</textarea></div>
    <div class="review-block"><h3>${task.category === "writing" ? "你认可的修改方向或参考写法" : "正确结论应该是什么"}</h3><p>这会直接成为 Codex 下一轮修改的依据。</p><textarea id="corrected-answer" placeholder="写出正确判断、应保留的边界，或你希望看到的表达……">${escapeHtml(form.corrected_answer)}</textarea></div>
    <div class="review-block"><h3>你希望优先怎么改</h3><input id="next-action" type="text" placeholder="例如：优先解决错误引用，其次调整表达" value="${escapeHtml(form.next_action)}" /></div>
    <div class="review-block"><h3>你的判断把握</h3><div class="segmented">${["高", "一般", "低"].map((value) => `<button type="button" class="choice neutral ${form.confidence === value ? "active" : ""}" data-confidence="${value}">${value}</button>`).join("")}</div></div>
    <div id="saved-banner" class="saved-banner"></div>
    <div class="save-bar"><div class="save-note">保存时会自动记录当前输出和 Prompt 调用编号，无需复制粘贴。<br>反馈不会自动修改 ThesisFlow；之后由 Codex 读取并执行迭代。</div><button id="save-button" class="save-button" ${form.decision && form.output_ref?.prompt_call_id ? "" : "disabled"}>保存审核结果</button></div>
  `;

  mainEl.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => setAnswer(button.dataset.answer, button.dataset.value)));
  mainEl.querySelectorAll("[data-decision]").forEach((button) => button.addEventListener("click", () => { form.decision = button.dataset.decision; renderReview(); }));
  mainEl.querySelectorAll("[data-confidence]").forEach((button) => button.addEventListener("click", () => { form.confidence = button.dataset.confidence; renderReview(); }));
  mainEl.querySelectorAll("[data-output-id]").forEach((button) => button.addEventListener("click", () => chooseOutput(button.dataset.outputId)));
  mainEl.querySelectorAll("[data-screening-path]").forEach((element) => element.addEventListener("change", () => {
    const output = outputData.outputs.find((item) => item.prompt_call_id === selectedOutputId);
    if (!output) return;
    const target = ensureScreeningReview(task, output);
    const parts = element.dataset.screeningPath.split(".");
    let cursor = target;
    parts.slice(0, -1).forEach((part) => { cursor = cursor[part]; });
    cursor[parts.at(-1)] = element.value;
    renderReview();
  }));
  mainEl.querySelectorAll("[data-portfolio-output]").forEach((element) => element.addEventListener("change", () => {
    const output = outputData.outputs.find((item) => item.prompt_call_id === element.dataset.portfolioOutput);
    if (!output) return;
    ensureScreeningReview(task, output).recommendation.status = element.value;
    renderReview();
  }));
  mainEl.querySelectorAll("textarea[data-screening-path]").forEach((element) => element.addEventListener("input", () => {
    const output = outputData.outputs.find((item) => item.prompt_call_id === selectedOutputId);
    if (!output) return;
    const target = ensureScreeningReview(task, output);
    const parts = element.dataset.screeningPath.split(".");
    let cursor = target;
    parts.slice(0, -1).forEach((part) => { cursor = cursor[part]; });
    cursor[parts.at(-1)] = element.value;
  }));
  document.querySelector("#refresh-output")?.addEventListener("click", refreshOutputs);
  ["reviewer-note", "corrected-answer", "next-action"].forEach((id) => {
    const element = document.querySelector(`#${id}`);
    element?.addEventListener("input", () => {
      const keys = { "reviewer-note": "reviewer_note", "corrected-answer": "corrected_answer", "next-action": "next_action" };
      form[keys[id]] = element.value;
    });
  });
  document.querySelector("#save-button")?.addEventListener("click", saveFeedback);
}

async function loadReviewData() {
  form = blankForm();
  const [feedbackResponse, outputsResponse] = await Promise.all([
    getJson(`/api/feedback/${selectedId}`),
    getJson(`/api/outputs/${selectedId}`),
  ]);
  outputData = outputsResponse;
  if (feedbackResponse.saved && feedbackResponse.feedback) {
    form = { ...blankForm(), ...feedbackResponse.feedback, answers: feedbackResponse.feedback.answers || {}, output_ref: feedbackResponse.feedback.output_ref || {} };
  }
  const savedId = form.output_ref?.prompt_call_id;
  const task = tasks.find((item) => item.id === selectedId);
  const defaultOutputs = task?.category === "screening" ? orderedScreeningOutputs(task) : outputData.outputs;
  const selected = outputData.outputs.find((item) => item.prompt_call_id === savedId) || defaultOutputs[0];
  selectedOutputId = selected?.prompt_call_id || savedId || null;
  if (selected) chooseOutput(selected.prompt_call_id);
  else renderReview();
}

async function refreshOutputs() {
  outputData = await getJson(`/api/outputs/${selectedId}`);
  const task = tasks.find((item) => item.id === selectedId);
  const selected = task?.category === "screening" ? orderedScreeningOutputs(task)[0] : outputData.outputs[0];
  if (selected) chooseOutput(selected.prompt_call_id);
  else renderReview();
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
  await loadReviewData();
});

getJson("/api/tasks").then(async (data) => {
  tasks = data.tasks;
  const requested = new URLSearchParams(window.location.search).get("task");
  selectedId = tasks.some((task) => task.id === requested) ? requested : tasks.find((task) => task.availability === "现在可以审核")?.id;
  taskOptions();
  await loadReviewData();
}).catch((error) => {
  mainEl.innerHTML = `<div class="error">读取失败：${escapeHtml(error.message)}</div>`;
});
