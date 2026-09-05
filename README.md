# ThesisFlow 科研协作智能体 · Demo

> 一站式科研文献筛选、精读与写作工作台的可运行 Demo，完整实现《ThesisFlow_PRD_Detailed.md》四大核心模块，验证"全链路工作台 + 长效记忆"核心产品假设。

## 文档导航

| 文档 | 定位 |
|------|------|
| [Product_Overview.md](./Product_Overview.md) | 作品说明：30 秒-10 分钟快速了解产品定位、亮点与迭代过程 |
| [ThesisFlow_PRD_Detailed.md](./ThesisFlow_PRD_Detailed.md) | 完整产品方案（PRD）：设计意图 + 工程实现 + 迭代记录 |
| 本文 README.md | 工程文档：问题背景、功能概览、快速启动与种子数据、项目结构 |
| [ThesisFlow_Presentation_Guide.md](./ThesisFlow_Presentation_Guide.md) | 产品全流程讲解手册（面试演示用）：按模块一~四编排的操作动线与讲解要点 |

## 问题背景

科研工作者的日常被三件事反复打断：**文献散落在文件夹里难以横向对比**、**精读划线的批注躺在 PDF 里写论文时用不上**、**AI 助手每次都从零开始、不懂你的研究脉络**。通用 AI 工具只解决单点问题，缺少把"文献 → 笔记 → 偏好 → 写作"串起来的工作流与记忆能力。

ThesisFlow 以「全链路工作台 + 长效记忆沉淀」为核心：四个模块的信息不断流——入库即结构化、打分联动检索权重、精读批注即投喂、写作按模式装配上下文；同时系统从每次交互中沉淀研究偏好，让 AI 从通用助手变成「越用越懂你」的科研伙伴。详细痛点分析与竞品对比见 [Product_Overview.md](./Product_Overview.md)。

## 基本功能

| 模块 | 功能点 | 状态 |
|------|--------|------|
| 模块一 · 领域知识库 | 研究图景思维导图（节点含进展解读与研究缺口）、个人记忆库（隐式提取 + 显式管理 + 冲突裁决 + 健康报告）、文献库（知识库级入库 + 知识挖掘流）、主页动态流（知识挖掘 + 项目进展 AI 摘要）、项目空间 | ✅ |
| 模块二 · 文献筛选矩阵 | PDF/Word/Markdown 批量导入、重复文献自动检测、标题识别（字号聚类+黑名单+LLM 兜底+手动纠正）、AI 四维打分（质量/相关性/方法论/创新性）+ 自定义维度、评分理由直显、加权排序、低分自动折叠、权重可调、人工校正评分（校正作为 few-shot 样例校准后续打分）、文献脉络知识图谱（主题聚类+关系标签边+脉络叙述） | ✅ |
| 模块三 · 沉浸式精读 | PDF.js 高清渲染、原文划选打标（🟢重点论据/🔵借鉴方法/🔴存疑/🟣背景）/划线/备注、Word/Markdown 结构化文档视图批注、结构化预读卡（核心问题/方法/结论/贡献/局限）、伴读问答（Markdown 渲染 + 来源跳转）、批注自动绑定原文片段并提升检索权重 | ✅ |
| 模块四 · 写作工作台 | 全对话驱动：写作助手生成修改提案卡（追加/修改/删除三模式，用户采纳才写入编辑器）、APA 文内引用（作者年份，点击跳转精读页定位原文）、起草模式（商讨 + Markdown 渲染 + 同步到大纲）、大纲 Markdown 底座、审查模式（五维 17 检查点建议卡 + 一键修改 + 逐条 Diff 采纳）、素材引料区（按批注勾选）、版本快照与回退、docx/tex/md 导出 | ✅ |

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
