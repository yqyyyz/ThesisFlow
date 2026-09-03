# ThesisFlow 演讲演示技术流程

> **文档定位**：将《ThesisFlow_PRD_Detailed.md》§10.7「演讲演示模式」与六阶段演示设计稿落成可执行的技术排演手册。
> 每阶段给出：操作动线 → 底层技术机制（代码锚点）→ 数据依赖 → 验收断言 → 台词卡 → 应急预案。
> 与 `ThesisFlow_PRD_Detailed.md`（产品层，第七章上下文工程设计 + 第九章工程实现）交叉引用。

## 0. 演示信息卡

| 项 | 内容 |
|----|------|
| 演讲者人设 | 小林 · AI 领域博士生（上下文工程、长上下文 RAG 与 Agent 记忆体系）· APA · 中文写作 |
| 演示课题 | 《AI 长上下文管理的工程化措施综述与展望》 |
| 总时长 | 15 分钟（2 + 3 + 3 + 2 + 4 + 1） |
| 核心卖点 1 | 一站式工作台：入库 → 四维打分 → 矩阵 → 精读 → 提案式写作全链路闭环 |
| 核心卖点 2 | 长期记忆沉淀进化：双层 System Prompt + 隐式/显式记忆，「越用越懂你」 |
| 核心壁垒 | 防幻觉闭环：内联角标生成约束 + 存在性/余弦/NLI 三重校验 + APA 文内引用呈现与溯源 |

> **口径说明**：设计稿中「50+ 篇」按实际种子规模改口为「20+ 篇」（24 篇入库，已确认）。
> 「Top 10 核心文献」在 24 篇规模下仍然成立（按加权总分排序取前 10）。台词卡已按此口径改写。

## 1. 演示架构总览

```
00:00  阶段一(2min) 记忆唤醒      → 全局控制台 + 个人记忆库
02:00  阶段二(3min) 筛选矩阵      → 文献工作台：四维打分 / 低分折叠 / 脉络图谱
05:00  阶段三(3min) 沉浸精读      → 阅读器：一页纸预读 / 划线升权 / 伴读问答溯源
08:00  阶段四(2min) 起草商讨      → 写作台起草模式：对话 / 同步大纲 / 隐式记忆提取
10:00  阶段五(4min) 提案式写作    → 写作模式：提案卡 / 三色引用校验 / 原子写入
14:00  阶段六(1min) 一键审查修复  → 审查模式：五维建议卡 / 一键修改双校验 / 置灰闭环
```

| 阶段 | 前端入口 | 后端能力 | 依赖模型 | 种子数据依赖 |
|------|---------|---------|---------|------------|
| 一 | 主页 `/` · 记忆库 `/domain/memory` | 三层 System Prompt 合成、记忆排序注入 | —（仅数据展示） | 小林画像 + 10 条记忆 |
| 二 | 文献矩阵 `/projects/demo/documents` | 四维打分、加权排序、折叠标记、脉络图谱 | LIGHT（打分）/ STRONG（图谱） | 24 篇文献 + 评分 + 图谱 |
| 三 | 阅读器 `/documents/{id}` | 一页纸预读、批注升权、文档域 top4 问答 | LIGHT（预读）/ STRONG（问答） | 批注数据（现场产生） |
| 四 | 写作台起草模式 | 商讨对话持久化、大纲提炼、每 4 轮隐式记忆提取 | STRONG（对话）/ LIGHT（记忆提取） | 项目研究问题、记忆池 |
| 五 | 写作台写作模式 | 提案卡生成、引用双阶段校验、统一写入 | STRONG（提案）/ LIGHT（NLI 校验） | Top 10 文献 + 精读批注 |
| 六 | 写作台审查模式 | 五维 17 检查点审查、一键修改双校验 | STRONG（审查）/ LIGHT（语义判定） | 已写正文 + 引用记录 |

## 2. 环境准备与种子数据

### 2.1 一次性种子构建

```bash
cd backend
cp .env.example .env        # 填 DEEPSEEK_API_KEY（聊天）与 DASHSCOPE_API_KEY（向量化/重排）
uv run python scripts/download_demo_papers.py   # 下载 20+ 篇 arXiv 论文 + 转换 2 篇多格式
uv run python scripts/seed_demo.py              # 全量入库（解析→切片→向量化→打分）+ 图谱 + 快照导出
python3 serve.py            # 启动后端；前端: cd ../frontend && npm run dev
```

种子内容（`backend/scripts/seed_demo.py`）：

- **画像**：小林 / 人工智能博士生 / 上下文工程与长上下文 RAG、Agent 记忆体系 / APA / 中文 → 驱动 `[User_Context]` 层；
- **记忆池**：10 条高置信记忆（`confidence` 0.82–0.95，`type=explicit`，`status=active`）→ 驱动 `[Domain_Memory]` 层，含「Lost-in-the-Middle 与注意力衰减机制关注」「KV Cache 内存开销视角」「GraphRAG/RRF/NLI 校验」「因果推断与机制分析偏好」等；
- **项目**：《AI 长上下文管理的工程化措施综述与展望》，research_question 含四大主线（窗口扩展 / GraphRAG / 混合检索 / 校验）；
- **文献**：24 篇 = 20 篇主题域真实论文（四大主题域，含《Lost in the Middle》核心文献）+ 4 篇主题外低相关样本（基因组学 / 材料科学 / 流体力学 / 天体物理；其中流体力学为 Markdown、天体物理为 Word，其余 PDF）——低相关样本用于演示「< 2.5 分自动折叠」与多格式入库；
- **脉络图谱**：`regenerate_doc_map` 预生成（聚类 + 关系边 + 脉络叙述）；
- **快照**：`backend/data/demo_fixture.json` + `demo_uploads_snapshot/`，供秒级复位。

### 2.2 排练前检查清单

- [ ] 后端 `/health` 返回 `chat_configured: true`；
- [ ] 百炼账户余额正常（欠费时入库停在 embedding 步骤，`user_logs` 无新 embedding 记录）；
- [ ] 矩阵页 24 篇全部 `ready`；其中 ≥1 篇低相关样本四维总分 < 2.5（折叠生效）；
- [ ] 记忆库显示 10 条记忆；控制台研究画像为「人工智能博士生」；
- [ ] 图谱页聚类数 ≥ 2；
- [ ] 预热：预先打开一次写作台与阅读器页面（首帧加载、PDF worker 就绪），避免上台等待；
- [ ] 确认引导面板可用：侧边栏「🎬 演示」→ 六阶段面板（每阶段：步骤清单 + 一键跳转 / 复制指令 / 重置按钮）。

## 3. 六阶段技术动线

### 阶段一 · 初始化与长期记忆唤醒（2 分钟）

**操作动线**
1. 登录即进入主页（全局控制台）；口播身份装载；
2. 左下角「个人设置」展示研究画像（AI 博士生 · 上下文工程与长上下文 RAG · APA）；
3. 左侧「领域知识库 → 个人记忆库」展示 10 条高置信记忆。

**技术机制**
- 三层 System Prompt 合成：`[Base_Persona] + [User_Context] + [Domain_Memory]`（`backend/app/prompts/templates.py`；合成见 `backend/app/services/writing.py`）；
- `[User_Context]` 取自 `users` 表 onboarding 字段（identity / discipline / sub_discipline / citation_style / language_pref）；
- `[Domain_Memory]` 按 `confidence × 时近系数` 取 top-10，总量 ≤1500 tokens（`backend/app/services/memory.py`）。

**数据依赖**：种子画像 + 10 条记忆（本次新增「因果推断与机制分析偏好」，confidence 0.90）。

**验收断言**
- ✔ 记忆库列表恰好 10 条、全部带高置信度徽标；
- ✔ 个人设置中研究画像与设计稿人设一致。

**台词卡**
> “正如大家所见，ThesisFlow 不是一个冷冰冰的通用工具。它通过分层 System Prompt 挂载了我过去的长期记忆。当我开启新研究时，它已经具备了与我的学术默契。”

**应急预案**：记忆列表异常时点「重置演示数据」（`POST /api/admin/demo-reset`，秒级恢复种子状态，不重跑 LLM）。

---

### 阶段二 · 20+ 篇文献高效筛选与矩阵构建（3 分钟）

**操作动线**
1. 引导面板点「进入文献矩阵」→ 项目文献工作台；
2. 口播多格式批量入库（24 篇 = 22 PDF + 1 Word + 1 Markdown，状态机 `uploaded→…→ready` 已全部完成）；
3. 展示四维打分与评分理由 → 演示低分折叠：展开/收起 <2.5 分文献；
4. 演示**人工校正评分**：分数格悬停 ✎ → 改分 + 填写校正理由 → 保存后「人工」徽标即时生效，讲解该校正将作为 few-shot 样例校准后续打分（越用越懂你）；
5. 拖动「相关性」权重滑块观察实时重排 → 锁定 Top 10；
6. 切换「文献脉络图谱」视图：聚类分支 + 关系边 + 脉络叙述。

**技术机制**
- 四维打分：LIGHT 模型 + 学科锚点校准（`backend/app/services/scoring.py` `score_document` / `pick_anchor`），输出 `{quality, relevance, methodology, novelty} + reason + confidence` JSON 存 `documents.scores`；
- 人工校正：`PUT /documents/{id}/scores` 覆写分数+理由 → 写 `score_feedback` 表 → 后续评分注入最近 6 条校正作 few-shot 校准样例（演示完记得 `demo-reset` 恢复干净状态）；
- 折叠规则：加权总分 < 2.5 自动折叠（默认四维等权，权重滑块可调）；
- 分层权重路由：Top Tier ×2.0 / Mid Tier ×1.2 / Base Tier ×0.8（`backend/app/services/rag.py:12`）；四维总分 ≥4 的文献摘要/结论标记 Mid Tier；
- 图谱：主题聚类 + 关系标签边（extends/supports/contrasts/background/same_topic）+ 脉络叙述，签名缓存防重复消耗（`backend/app/services/docmap.py`）；
- 入库状态机与失败兜底（`backend/app/services/ingestion.py` `run_pipeline`）。

**数据依赖**：24 篇入库完成；4 篇低相关样本已由 LLM 打出低相关性分。

**验收断言**
- ✔ 矩阵 24 篇就绪；3 篇低相关样本四维总分 1.0 处于折叠态（第 4 篇 CAGI 2.75 分可见，相关性仅 1 分，可展开现场讲解“评分理由”）；
- ✔ 展开折叠区时低分文献可见（可指出其「相关性 1 分」评分理由）；
- ✔ 权重滑块拖动后排序变化 < 1s；
- ✔ 图谱有 ≥2 个聚类分支，可点开分支叙述。

**台词卡**
> “面对 20+ 篇文献，ThesisFlow 帮我进行了四维筛选。通过自定义权重，我能秒级构建结构化对比矩阵，快速锁定 Top 10 核心文献。”

**应急预案**
- 若低相关样本总分 ≥2.5 未触发折叠：现场将「相关性」权重拉满并口播「权重实时重排」，低分文献立即沉底；
- 图谱未生成/过期：点「更新图谱」（手动触发，防 token 浪费）。

---

### 阶段三 · 沉浸式精读与权重路由沉淀（3 分钟）

**操作动线**
1. 引导面板点「打开《Lost in the Middle》」→ 进入阅读器（左：预读卡；中：PDF 原文；右：批注沉淀 + 伴读问答）；
2. 左栏展示一页纸结构化总结（核心问题 / 方法 / 结论 / 贡献 / 局限五分区卡片）；
3. 划选关键结论 → 打标「重点论据」→ 展示该片段升权 Top Tier（×2.0）；
4. 右栏伴读问答输入示例问题「该文献的注意力衰减实验结论是什么？」→ 回答携带 `[c1]` 锚点徽标 → 点击跳页 + 高亮闪烁定位原文。

**技术机制**
- 一页纸预读：LIGHT 结构化 JSON（`core_question / methods / conclusions / contributions / limitations`，`backend/app/services/reading.py` `generate_pre_read`，模板 `prompts/templates.py:57`）；
- 批注升权：打标/划线写入 `annotations` 后 `promote_chunk_tier` 将所在 chunk 置为 Top Tier（`reading.py:17`），检索权重 ×2.0（`rag.py:12`）；
- 伴读问答：文档域检索取 **top4 chunks** 作为证据（`backend/app/api/reading.py:229`），STRONG 模型回答并内联 `[c1]…[cN]` 锚点；`refs` 返回 chunk 定位元数据；
- 溯源跳转：PDF 依据 bbox 滚页 + 闪烁页面轮廓；Word/Markdown 滚动到来源块并闪烁背景（第六轮修复）。

**数据依赖**：《Lost in the Middle》已 ready；该次演示中现场产生 1-2 条「重点论据」批注。

**验收断言**
- ✔ 预读卡五分区渲染完整；
- ✔ 打标后右栏批注沉淀区实时新增条目；
- ✔ 伴读问答回答含可点击 `[cN]` 徽标，点击后 PDF 跳转对应页并闪烁高亮。

**台词卡**
> “这里的每一个划线与批注，都会实时转为高权重索引。当我在后续写作中调用时，系统会优先 Attention 到这些精读笔记。”

**应急预案**：问答超时（STRONG 约 5-10s）→ 口播“系统正在文档域检索 top4 证据块”；若 PDF 页闪失败，改口播溯源机制并按角标编号手动翻页。

---

### 阶段四 · 起草商讨与长期记忆隐式进化（2 分钟）

**操作动线**
1. 引导面板「进入起草模式」（自动切换写作台 Tab）；
2. 粘贴商讨开场白 → 与 AI 来回 2-3 轮商讨论文大纲结构；
3. 口播：对话满 4 轮后，系统后台唤醒轻量模型提取讨论中表达的新偏好（示例：KV Cache 内存开销视角），经余弦比对后增量合并入长效记忆池；
4. 点「同步到大纲」→ 一键提炼 Markdown 结构化大纲（可切换编辑/预览）。

**技术机制**
- 起草对话：`POST /projects/{id}/drafting-chat`（`backend/app/api/writing.py:320`），对话落 `chat_sessions / chat_messages` 持久化，刷新不丢；
- 隐式记忆提取：`user_turns % 4 == 0` 时触发（`writing.py:354`）——LIGHT 模型抽取候选记忆 JSON → 与现存记忆余弦比对：>0.90 合并（trigger_count+1）、[0.60, 0.90] 冲突置 `conflict_with` 待裁决、新记忆初始 confidence 0.5（`backend/app/services/memory.py` `MERGE_THRESHOLD=0.90` / `CONFLICT_LOW=0.60`）；
- 大纲：Markdown 底座存储（`outline_json.markdown`），「同步到大纲」由 STRONG 直接输出 Markdown（第四轮改造）。

**数据依赖**：项目 research_question；现场对话产生的候选记忆。

**验收断言**
- ✔ 对话刷新后历史仍在；
- ✔ 第 4 轮后记忆库出现新记忆（或触发「冲突裁决」卡片——两个结果都是亮点，可现场讲解）；
- ✔ 「同步到大纲」后大纲面板呈现结构化 Markdown。

**台词卡**
> “无需我手动输入，ThesisFlow 在与我的商讨过程中，隐式捕获了我的最新研究视角并将其存入我的第二大脑，实现了知识的自我进化。”

**应急预案**：若新记忆未即时出现在记忆库（后台异步），点「记忆库」页面手动刷新并口播后台异步提取机制；演示前可预演 4 轮确认提取时延。

---

### 阶段五 · 提案式写作与双重防幻觉校验（4 分钟）

**操作动线**
1. 引导面板「进入写作模式」+ 复制续写指令 `/续写 结合 Top 10 文献与我的批注，撰写关于注意力机制在超长上下文下的局限性`；
2. AI 输出**提案卡**（约 10-20 秒，非流式整卡）：展示 APA 文内引用角标（作者年份，如（Liu et al., 2023））+ 引用校验徽标；
3. 讲解三色徽标：🔵 蓝 = 校验通过（余弦 ≥0.70 或 NLI entail）；🟡 黄 = 弱支持（中间带 NLI neutral）；🔴 红 = 无效引用（<0.50 或 NLI contradict / 标记不在证据列表）；
4. 点「采纳」→ 基于 ProseMirror 的 `applyContentChange` 将段落与引用节点原子化写入编辑器；口播「AI 永不直接改稿，决策权在研究者手中」。

**技术机制**
- 提案契约三模式：append（追加）/ replace（锚点替换）/ delete（锚点删除）（`backend/app/services/writing.py` 提案 Prompt）；
- 生成侧强约束：Prompt 强制句末内联角标标记（以具体示例 `[1:3]` 表述），明令禁止输出 `[doc_id:chunk_id]`/`[NO_SUPPORT]` 字面占位符字样，证据不足以中文说明并标注人工补充；前端将角标渲染为 APA 文内格式；
- **双阶段引用校验**（`backend/app/services/verification.py`）：
  - 存在性检查：标记必须命中本次送模型的证据 chunk 列表，否则 `invalid`；
  - 向量快筛：句-Chunk 余弦 `<0.50` invalid、`≥0.70` pass；中间带触发 **LIGHT NLI**（entail→normal / contradict→invalid / neutral→weak）；
  - 数值/因果类断言（正则识别，如 `p<0.05`、`显著提升`）阈值收紧为 0.60/0.80 且强制 NLI；
- 校验结果落 `citations` 表（`verify_method: vector|nli`，`nli_verdict`）→ 支撑幻觉率/溯源准确率 KPI 口径；
- 原子写入：提案文本解析为完整段落 JSON 节点（文本+引用节点）后插入；锚点按后端计算的 `anchor_occurrence` 序号定位（有划选时优先取选区内出现）；替换前校验当前位置文本与锚点一致（文稿变更即中止）；多处出现且无序号 → 明确报错「锚点存在多处，请人工核对」，不再静默替换（`frontend/src/components/writing/WritingWorkspace.tsx:331` `applyContentChange`）。

**数据依赖**：Top 10 文献 chunks（含阶段三升权的 Top Tier 批注 chunk）；大纲路径；素材区选中笔记。

**验收断言**
- ✔ 提案卡出现可点击引用角标 + 至少一个蓝色徽标；
- ✔ 点击角标 → 右侧面板打开原文对应位置高亮；
- ✔ 「采纳」后正文与引用节点一次性写入，光标位置正确；「拒绝」不写入可继续对话。

**台词卡**
> “看，这是 ThesisFlow 最大的特色——防幻觉闭环。所有的引用都有据可查，通过 NLI 语义校验保证‘所写即所引’。AI 给出修改提案，最终决策权始终在研究者手中。”

**应急预案**
- 提案生成 10-20 秒：提前口播“系统正在检索 Top 10 证据块并做引用校验”填充等待；
- 若某引用被判黄色/红色：**现场保留为亮点**——讲解“弱支持/无效引用正是校验门的价值”，再输入修正指令二次生成；
- 锚点无法唯一定位（多处出现且无序号/前缀不唯一）：系统明确报错并提示人工定位（设计内降级路径）。

---

### 阶段六 · 多维同行审查与一键修复闭环（1 分钟）

**操作动线**
1. 引导面板「进入审查模式」→ 点「审查全文」；
2. 展示五维建议卡（论证充分性 / 逻辑连贯性 / 结构完整性 / 学术规范性 / 方法严谨性，17 个检查点），点击锚点定位对应段落；
3. 勾选 1-2 张问题卡 →「AI 一键修改所选问题」→ 逐条 Diff 卡（✓ 校验通过 / ⚠ 需人工复核）；
4. 采纳 → 正文替换 + 快照留存；建议卡置灰显示「✓ 已修复」防重复修改。

**技术机制**
- 审查：STRONG 切 Critical Review 视角，仅评审文本本身、不引入外部文献，输出 `{dimension, anchor_text, issue, suggestion, severity}` 列表；
- 一键修改双重校验：① 重写强制保留原引用标记（完整性规则）；② LIGHT 语义判定「是否解决问题且未改变原意」→ 逐条 Diff 卡；
- 采纳走统一写入工具（与提案同一套解析/定位/校验逻辑，第四轮修复）；
- `resolvedCards` 状态：采纳后建议卡置灰 + 「✓ 已修复」徽标、全选计数排除；重新审查时重置（第六轮新增）；
- 每次采纳自动留存快照，可演示版本历史回退。

**数据依赖**：阶段五写入的正文段落（≥1 段含引用）。

**验收断言**
- ✔ 建议卡按维度分组、点击锚点能定位段落；
- ✔ 一键修改后 Diff 卡逐条展示校验结论；
- ✔ 采纳后卡片置灰、正文更新、快照 +1。

**台词卡**
> “最后 1 分钟：五维同行审查 + 一键修复。每条建议都有锚点定位，每次修改都经过引用完整性双校验——从入口到出口，防幻觉贯穿全程。”

**应急预案**：审查全文耗时长 → 改为「审查选中段落」缩短路径；时间不足时跳过采纳动作，仅展示 Diff 卡。

## 4. 中断恢复手册

| 情形 | 恢复动作 | 耗时 |
|------|---------|------|
| 演示中途数据弄脏（乱批注/乱草稿） | 引导面板「重置演示数据」或 `POST /api/admin/demo-reset`：从 fixture 纯数据恢复 + uploads 快照回拷，**不重跑 LLM** | 秒级 |
| fixture 缺失/损坏 | 重跑 `uv run python scripts/seed_demo.py`（需保留 `data/demo_papers/` 24 个文件） | 20-35 分钟 |
| 后端进程崩溃 | `python3 serve.py`（守护启动，自动拉起） | 秒级 |
| 百炼欠费导致 embedding 失败 | 充值后重新上传对应文献；或临时演示已入库数据，避开新入库动作 | 分钟级 |
| 演示当天网络波动导致某次 LLM 调用超时 | 不重试同一指令，口播机制转移话题，点面板下一阶段 | 秒级 |

**每阶段复位点**：重置后从阶段一重新进入即可；阶段三的批注与阶段四的对话是现场产生的演示资产，重置会清空——同一场排练中如需重演阶段三，只重置一次并重新划选。

## 5. 台词口径对照表（设计稿 → 现场版）

| 设计稿原文 | 现场口径 | 原因 |
|-----------|---------|------|
| 需管理 50+ 篇跨领域文献 | 20+ 篇（24 篇入库） | 保持现有种子规模（已确认），矩阵展示效果不变 |
| 批量导入 50 篇文献（PDF/Docx/MD） | 批量导入 20+ 篇（PDF/Word/Markdown 三格式） | 24 篇含 1 篇 Word + 1 篇 Markdown，多格式卖点保留 |
| 过往沉淀的 10 条高置信度记忆 | 10 条高置信度记忆 | 已对齐（种子含 10 条） |
| 四分区卡片（核心问题、方法、结论与局限） | 五分区卡片（核心问题/方法/结论/贡献/局限） | 实现在设计稿基础上多「贡献」一区，现场直接展示 |
| 模型基于内部 Chunk top4 回答并附带 [c1] 锚点 | 一致 | 实现即 top4（`api/reading.py:229`） |
| 对话满 4 轮后隐式记忆提取 | 一致 | 实现即 `user_turns % 4 == 0`（`api/writing.py:354`） |
| 蓝色（相似度≥0.70/NLI entail）黄色（弱支持）红色（无效） | 一致；补充：数值/因果断言阈值收紧为 0.60/0.80 | 实现即双阶段校验（`verification.py`） |

## 6. 附录：关键代码锚点索引

| 机制 | 位置 |
|------|------|
| 三层 System Prompt 合成 | `backend/app/prompts/templates.py` · `backend/app/services/writing.py` |
| 四维打分与学科锚点 | `backend/app/services/scoring.py` |
| 入库状态机 / 多格式解析 | `backend/app/services/ingestion.py` · `backend/app/services/docparse.py` |
| 分层权重路由（2.0/1.2/0.8） | `backend/app/services/rag.py:12` |
| 批注升权 Top Tier | `backend/app/services/reading.py:17` |
| 伴读问答 top4 + [cN] 锚点 | `backend/app/api/reading.py:229` |
| 隐式记忆提取（每 4 轮） | `backend/app/api/writing.py:354` · `backend/app/services/memory.py` |
| 双阶段引用校验（vector→NLI） | `backend/app/services/verification.py` |
| 提案卡契约（append/replace/delete） | `backend/app/services/writing.py` · `backend/app/schemas/writing.py` |
| 原子写入 applyContentChange | `frontend/src/components/writing/WritingWorkspace.tsx:331` |
| 审查五维 17 检查点 + 一键修改双校验 | `backend/app/prompts/templates.py:100-119` · `backend/app/api/writing.py` |
| 演示引导面板 / 跨页联动 | `frontend/src/lib/demoScript.ts` · `frontend/src/stores/demo.ts` · `frontend/src/components/demo/DemoGuide.tsx` |
| 演示重置与快照 | `backend/app/services/demo.py`（`export_fixture` / `restore_demo`） |
| 种子数据构建 | `backend/scripts/seed_demo.py` · `backend/scripts/download_demo_papers.py` |
