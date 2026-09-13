# ThesisFlow 科研协作智能体 · Demo

> 面向科研任务的 AI 文献与写作工作台 Demo，重点验证文献筛选、精读和可控人机协作中的决策质量与证据可信度。

## 文档导航

| 文档 | 定位 |
|------|------|
| [Product_Overview.md](./Product_Overview.md) | 作品说明：30 秒-10 分钟快速了解产品定位、亮点与迭代过程 |
| [ThesisFlow_PRD_Detailed.md](./ThesisFlow_PRD_Detailed.md) | 完整产品方案（PRD）：设计意图 + 工程实现 + 迭代记录 |
| [ThesisFlow_P1_产品测评方案.md](./ThesisFlow_P1_产品测评方案.md) | P1 测评协议：30 个核心任务、Prompt 追踪、人机分工与调优决策树 |
| [evaluation/p1/](./evaluation/p1/) | P1 可执行测评包：文献清单、任务卡、试评标准、Prompt registry 与运行模板 |
| [evaluation-workbench/](./evaluation-workbench/) | 独立的测评优化人工协作工作台：查看现状、人工审核、本地保存反馈 |
| 本文 README.md | 工程文档：问题背景、功能概览、快速启动与种子数据、项目结构 |
| [ThesisFlow_Presentation_Guide.md](./ThesisFlow_Presentation_Guide.md) | 产品全流程讲解手册（面试演示用）：按模块一~四编排的操作动线与讲解要点 |

## 问题背景

科研工作者的日常被三件事反复打断：**文献散落在文件夹里难以横向对比**、**精读划线的批注躺在 PDF 里写论文时用不上**、**AI 助手每次都从零开始、不懂你的研究脉络**。通用 AI 工具只解决单点问题，缺少把"文献 → 笔记 → 偏好 → 写作"串起来的工作流与记忆能力。

ThesisFlow 围绕“明确研究问题 → 导入与筛选 → 精读与批注 → 协作写作与审查 → 导出和继续修改”组织主流程。评分与精读建议分离，批注按用途进入写作，引用分别检查来源、定位和证据支持；长期记忆作为可选的跨任务积累。详细说明见 [Product_Overview.md](./Product_Overview.md)。

## 基本功能

| 模块 | 功能点 | 状态 |
|------|--------|------|
| 模块一 · 领域知识库 | 研究图景（候选研究问题基于当前资料、允许为空）、个人记忆库（显式管理、隐式候选、冲突裁决、健康报告）、文献库与进展动态 | ✅ |
| 模块二 · 文献筛选矩阵 | 多格式导入、四维评分、独立 AI 精读建议与理由、缺失信息显式标注、条件折叠与关闭开关、权重和人工校正、文献脉络图谱 | ✅ |
| 模块三 · 沉浸式精读 | PDF/Word/Markdown 精读、预读卡与阅读重点、四类用途明确的原文批注、伴读问答与来源定位、批注检索升权 | ✅ |
| 模块四 · 写作工作台 | 提案采纳才写入、过期/定位失败/写入失败状态、来源/定位/支持性三层引用校验、作者年份引用定位、审查、快照回退与多格式导出 | ✅ |

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

## 种子数据与重置

- **种子数据**（一次性构建，约 20-35 分钟）：
  ```bash
  cd backend
  uv run python scripts/download_demo_papers.py   # 下载 20+ 篇真实 arXiv 论文（含 4 篇主题外低相关样本）
  uv run python scripts/seed_demo.py              # 全量入库（解析→切片→向量化→打分）+ 图谱 + 快照导出
  ```
- **重置**：左下角「个人设置」弹窗底部「重置演示数据」按钮，或 `POST /api/admin/demo-reset`，秒级恢复种子状态（不重跑 LLM）；
- **讲解演示**：面试演示用的全流程操作动线与讲解要点见 `ThesisFlow_Presentation_Guide.md`。

### 种子数据内容（对应 PRD 用户旅程）

1. 小林研究画像（AI 博士生 · 上下文工程与长上下文 RAG · APA · 中文）+ 10 条高置信记忆，驱动主页记忆唤醒；
2. 演示项目《AI 长上下文管理的工程化措施综述与展望》：24 篇文献（22 PDF + 1 Word + 1 Markdown）已就绪，含四维打分、低分折叠样本与脉络图谱；
3. 快照 `backend/data/demo_fixture.json` + uploads 快照，支撑秒级复位。

## P1 测评与 Prompt 追踪

人工审核通过独立小产品完成，不进入 ThesisFlow 页面和业务 API：

```bash
cd evaluation-workbench
./start.sh                 # http://127.0.0.1:8010
```

工作台只读获取已经关联任务编号的模型输出、实际 Prompt 和上下文记录，并把人工反馈保存到自己的本地目录；不修改 ThesisFlow、Prompt 或模型。你无需复制粘贴输出，保存后回到 Codex，说明“读取工作台反馈并进行迭代”。

测评请求可通过 `X-Evaluation-Run-Id` 和 `X-Evaluation-Task-Id` 请求头关联到具体运行与任务。每次生成式模型调用记录渲染后的 System Prompt、User Prompt、完整 messages、上下文清单、模型参数、输出、错误与哈希。

```bash
# 导出指定运行的本地 JSONL 日志
curl -sS "http://127.0.0.1:8000/api/observability/prompt-calls?run_id=P1-PILOT-001"

# 对外展示时隐去 Prompt 与原始输出内容
curl -sS "http://127.0.0.1:8000/api/observability/prompt-calls?run_id=P1-PILOT-001&include_content=false"
```

原始 Prompt 日志可包含文献片段和个人记忆，仅用于本地受控测评；秘钥在写入前脱敏。完整协议与执行资产见 [P1 测评执行包](./evaluation/p1/README.md)。

## 项目结构

```
backend/
  app/
    api/        # health/profile/projects/documents/reading/writing/memory/domain/observability
    core/       # llm.py 模型适配 + Prompt 追踪 · vectors.py · sse.py
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
evaluation/p1/                    # P1 文献清单、任务、Prompt registry 与运行模板
evaluation-workbench/             # 独立人工协作产品（任务现状、人工审核、本地反馈）
```
