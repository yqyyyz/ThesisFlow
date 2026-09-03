# ThesisFlow 科研协作智能体 · Demo

> 防幻觉学术写作与文献工作台的可运行 Demo，完整实现《ThesisFlow_PRD_Detailed.md》四大核心模块，验证"防幻觉 + 长效记忆"核心产品假设。

## 文档导航

| 文档 | 定位 |
|------|------|
| [Product_Overview.md](./Product_Overview.md) | 作品说明：30 秒-10 分钟快速了解产品定位、亮点与迭代过程 |
| [ThesisFlow_PRD_Detailed.md](./ThesisFlow_PRD_Detailed.md) | 完整产品方案（PRD）：设计意图 + 工程实现 + 迭代记录 |
| 本文 README.md | 工程文档：功能全景、技术栈、启动与演示方式、已知局限 |
| [ThesisFlow_Demo_Technical_Flow.md](./ThesisFlow_Demo_Technical_Flow.md) | 六阶段演示排演手册（台词卡与技术动线） |

## 功能全景

| 模块 | 功能点 | 状态 |
|------|--------|------|
| 模块二 · 文献筛选矩阵 | PDF 批量导入、重复文献自动检测删除、标题识别加强（字号聚类+黑名单+作者切分+LLM兜底+手动纠正/批量重识别）、AI 四维打分 + 自定义维度、评分理由直显、加权排序、低分折叠、权重可调、**人工校正评分**（分数格内联改分+填理由，「人工」徽标；校正作为 few-shot 样例校准后续打分）、**文献脉络知识图谱**（主题聚类+关系标签边+脉络叙述，缓存防重复消耗，新文献提示后用户主动更新） | ✅ |
| 模块三 · 沉浸式精读 | PDF.js 高清渲染（HiDPI 超采样 + 命令式渲染 + 自绘文本层）、PDF 原视图划选打标（🟢重点论据/🔵借鉴方法/🔴存疑/🟣背景）/划线/备注（多行选区矩形捕获）、**支持 Word(.docx)/Markdown 文献**（结构化文档视图划选批注）、结构化预读卡（核心问题/方法/结论/贡献/局限）、伴读问答（Markdown 渲染 + 来源跳转）、批注自动绑定 Chunk 并提升检索权重；右栏布局：上 1/3 批注沉淀 + 下 2/3 伴读问答（固定） | ✅ |
| 模块四 · 写作工作台 | **全对话驱动**：右侧写作助手对话生成修改提案卡（**追加/修改/删除**三种模式 + 引用校验徽标；追加按指令定位插入对应段落之后），统一写入工具落笔（段落节点解析 + 锚点序号定位 + 应用前一致性校验 + 多处出现时明确报错 + 审查采纳冲突「基于当前文本重试」），用户采纳后生效；**标准文内引文格式**（APA 作者年份如（Liu et al., 2023），点击跳转精读页定位原文片段，三态配色保留）；起草模式（商讨 + **Markdown 渲染回复** + 「同步到大纲」 + 对话持久化）；**大纲 Markdown 底座**（编辑/预览/同步到编辑器）；审查模式（五维度 17 检查点纯中文建议卡 + 严重度锚定 + 一键修改所选问题：重写+引用完整性+LLM 语义双重校验 → 逐条 Diff 采纳）；素材引料区（按批注 ID 勾选+全选）；版本快照与回退；docx/tex/md 导出 | ✅ |
| 模块一 · 领域知识库 | 侧边栏「领域知识库」三入口：研究图景（思维导图，节点含进展解读，点击看详情）、个人记忆库（隐式提取+显式管理+冲突裁决+健康报告）、文献库（知识库级入库 + 知识挖掘流）；主页动态流（知识挖掘 + 项目进展 AI 摘要）；项目空间（树状列表+区内置新建+项目设置弹窗） | ✅ |

## 技术栈（PRD 简化单体版）

```
前端  Next.js 16 + TypeScript + Tailwind + TipTap + PDF.js + Zustand
后端  Python 3.13 + FastAPI + SQLAlchemy + SQLite(+FTS5) + PyMuPDF + python-docx
AI   聊天：DeepSeek（deepseek-v4-pro 写作/审查 · deepseek-v4-flash 打分/摘要/校验）
     向量化：百炼 text-embedding-v4 · 重排：gte-rerank-v2（需百炼账户余额正常）
导出  pandoc 3.x
```

与 PRD 的映射：SQLite+暴力余弦 ↔ pgvector｜FastAPI BackgroundTasks ↔ Celery｜本地磁盘 ↔ MinIO｜PyMuPDF 启发式解析 ↔ GROBID/PaddleOCR（扫描版走兜底提示）。升级路径已在代码分层中预留（`core/vectors.py`、`services/ingestion.py`）。

## 架构升级（P0+P1，成本-质量平衡体系）

| 子系统 | 说明 | 入口 |
|--------|------|------|
| 意图路由 | 查询三分类（fact/multi_hop/global）：规则层+LIGHT 兜底，分别走「混合检索/聚类定点/物化摘要」三条路线 | `core/intent.py` + `rag.retrieve_for_intent` |
| 二层缓存 | Result Cache（问答/事实/全局，TTL 12h）+ Context Cache（物化摘要，TTL 3 天）；文献就绪/批注升权/记忆变更自动失效 | `core/cache.py` |
| Parent-Child 切片 | 父块 600-1500 tokens 装配 + 子块 200-400 tokens 检索，子块命中自动扩展父块上下文 | `chunking.build_chunks_v2` + `POST /rechunk` |
| Lazy GraphRAG | 零 LLM 实体索引 + 聚类 summary_l1 物化 + 新文献 delta 增量合入；深抽取按需触发（`docmap:deep-extract`） | `services/docmap.py` |
| 双阶段引用校验 | 余弦快筛（<0.5 无效 / ≥0.7 通过）+ 中间带 LIGHT NLI 判定；数值/因果断言强制 NLI 且阈值收紧 | `services/verification.py` |
| 观测端点 | LLM 统计（STRONG 占比/TTFT/前缀复用率）、路由分布、缓存命中、引用校验与幻觉率 | `GET /api/observability/summary` |

## 快速启动

```bash
# 1. 后端
cd backend
cp .env.example .env        # 填入 DEEPSEEK_API_KEY 与 DASHSCOPE_API_KEY
python3 serve.py            # 守护启动（--reset 可清空数据库重建）
# 健康检查: curl http://localhost:8000/health

# 2. 前端
cd ../frontend
npm install                 # 国内网络已在 .npmrc 外通过 registry.npmmirror.com 验证可用
npm run dev                 # http://localhost:3000
```

## 演讲演示模式

- **进入**：侧边栏左上角「🎬 演示」按钮 → 出现浮动引导面板（六阶段操作指引 + 一键跳转/复制指令）；
- **剧本**：① 记忆唤醒（控制台+个人记忆库，10 条高置信记忆）→ ② 20+ 篇文献矩阵（PDF/Word/Markdown 三格式 · 四维打分 · 低分自动折叠 · 脉络图谱）→ ③ 精读《Lost in the Middle》（划选升权+伴读问答溯源）→ ④ 起草商讨（满 4 轮隐式记忆提取）→ ⑤ 提案式写作（三色引用校验+原子写入）→ ⑥ 五维审查（一键修复+置灰闭环）；台词卡与逐阶段技术动线见 `ThesisFlow_Demo_Technical_Flow.md`；
- **种子数据**：`uv run python scripts/download_demo_papers.py` 下载 20+ 篇真实 arXiv 论文（含 4 篇主题外低相关样本，其中 2 篇自动转换为 Word/Markdown 演示多格式入库）→ `uv run python scripts/seed_demo.py` 构建全套种子并导出快照（约 20-35 分钟，一次性）；
- **排练重置**：引导面板「重置演示数据」或 `POST /api/admin/demo-reset`，秒级恢复种子状态（不重跑 LLM）。

### 演示动线（对应 PRD 用户旅程）

1. `http://localhost:3000` 主页：查看知识挖掘流与项目进展摘要；左下角个人设置填写研究画像；
2. 左侧「项目空间」点 ＋ 新建项目，设定研究问题（项目名旁 ✎ 可改标题/研究目标/阶段）；
3. 「文献工作台」上传 `samples/` 中的测试文献（支持 **PDF / Word(.docx) / Markdown**），观察状态机流转与四维打分（含评分理由）；可「维度管理」增加自定义维度并重打分；标题不准时点文献行 ✎ 手动修改；
4. 点击文献标题进入精读：PDF 原视图直接划选 → 打标/划线/备注（多行高亮即所见）；Word/Markdown 文献展示结构化文档视图划选批注；右栏下方伴读问答提问（Markdown 渲染 + `[cN]` 来源跳转）；左栏看结构化预读卡；
5. 切「文献脉络图谱」视图：聚类分支 + 关系边 + 脉络叙述（有新文献时按提示主动更新）；
6. 「写作工作台」起草模式：与 AI 商讨后点「同步到大纲」（Markdown 大纲，可预览/编辑）；切写作模式：右侧对话输入指令（续写/修改/删除）→ 审核提案卡（三种模式徽标 + 引用校验）→ 采纳写入/拒绝继续讨论；
7. 切审查模式：审查全文 → 勾选建议卡 → 「AI 一键修改所选问题」→ 逐条 Diff（✓校验通过/⚠需人工复核）审核采纳；版本历史回退；导出 Word/LaTeX；
8. 左侧「领域知识库」：研究图景思维导图（点节点看解读）、个人记忆库（冲突裁决/健康报告）、文献库（上传知识库资料触发知识挖掘）。

## 项目结构

```
backend/
  app/
    api/        # health/profile/projects/documents/reading/writing/memory/domain
    core/       # llm.py 双供应商适配器 · vectors.py · sse.py
    models/     # SQLAlchemy（对应 PRD 9.3 表结构）
    prompts/    # PRD 9.5 四套 Prompt 模板及扩展
    services/   # parsing/chunking/scoring/ingestion/rag/writing/reading/
                # memory/landscape/export/crossref
    main.py
  serve.py      # 守护启动脚本（双 fork 脱离）
  samples 见仓库根目录
frontend/
  src/app/                        # 页面路由
  src/components/reader/          # PDF.js 阅读器 + 三栏精读
  src/components/writing/         # TipTap 编辑器 + 引用节点 + 三模式工作台
  public/pdf.worker.min.mjs       # PDF.js worker
```

## 防幻觉机制关键实现

- **生成侧**：写作提案 Prompt 强制句末内联角标标记（以具体示例 `[1:3]` 表述），明令禁止输出 `[doc_id:chunk_id]`/`[NO_SUPPORT]` 字面占位符字样，证据不足以中文说明并标注人工补充（`prompts/templates.py`）；
- **校验门（双阶段）**：采纳前校验——引用存在性检查（不在证据列表 → `invalid` 红色）+ 句-Chunk 余弦相似度快筛（<0.50 无效 / ≥0.70 通过，中间带 LIGHT NLI 语义判定，数值/因果断言阈值收紧），校验徽标直接展示在提案卡上；
- **一键修改双校验**：重写强制保留原引用标记（完整性规则判定）+ LIGHT 语义判定（是否解决问题且未改变原意）；
- **前端呈现**：角标由 NodeView 渲染为 APA 文内引用格式（作者年份），点击跳转精读页定位原文；精读页高亮由选区矩形捕获（多行精确）与 `parsing.locate_bbox`（旧数据兼容）双路渲染。

## 已知局限（Demo 范围）

| 项 | 说明 |
|----|------|
| 扫描版 PDF | 无文本层，无法选区批注（文本层自绘输出 0 span 告警；可转 Word/Markdown 后精读） |
| 高亮坐标 | 与固定渲染缩放绑定，未来加缩放需重做坐标映射 |
| 公式还原 | 未集成 pix2tex，公式按文本层尽力提取 |
| 写作提案 | 非流式整卡生成（约 10-20 秒）；锚点无法唯一定位（多处出现且无序号/前缀不唯一）时降级为人工定位修改提示 |
| **百炼依赖** | 向量化/重排走百炼账户，欠费时入库停在 embedding 步骤，充值后重新上传即可 |
| rechunk | 重建切片后历史批注的 chunk_key 可能失效（批注保留，引用绑定需重新打标） |
| 图谱增量 | delta 合入仅对已生成过图谱的项目生效 |
| 协同编辑 | Yjs 已预留（TipTap 内核），未启用多人协同 |
| 鉴权 | 单用户模式，未实现 JWT |
| DOI 导入 | MVP 已移除 |
| 向量检索 | 暴力余弦（千级 chunk 毫秒级），规模化需迁移 pgvector |
| rerank | 依赖百炼原生 SDK，失败时自动降级为加权排序 |
| 导出 | 参考文献为内置格式模板（非完整 CSL）；PDF 需 xelatex，建议用 docx/tex/md |

## 观测

所有 LLM 调用（模型/时延/tokens）与引用校验结果写入 `user_logs` 表（Langfuse 的本地降级），可支撑 PRD 第八章 KPI 口径统计：

```sql
SELECT slot, model, COUNT(*), AVG(latency_ms) FROM user_logs GROUP BY slot, model;
SELECT status, COUNT(*) FROM citations GROUP BY status;
```
