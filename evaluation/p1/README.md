# ThesisFlow P1 测评执行包

本目录是 [ThesisFlow P1 产品测评方案](../../ThesisFlow_P1_产品测评方案.md) 的可执行资产包。

## 人工审核入口

人工操作不再直接面对本目录中的 CSV 和内部术语。请启动独立的 [测评优化人工协作工作台](../../evaluation-workbench/README.md)：

- 「任务现状」页面查看产品模块、当前 Prompt、RAG 规则与已有结果。
- 「人工审核」页面按提示完成判断并保存。
- 保存后回到 Codex，说明“读取工作台反馈并进行迭代”。

本目录继续作为工作台背后的测评数据源，由 Codex 维护。

## 当前状态

- 方案：已审核通过。
- 文献清单：24 篇已编号并完成初始 dev/holdout 划分。
- 能力检查项：文献筛选、文献阅读、辅助写作各 10 项，已建立。
- 首批人工审核：S01、R01、W01 已准备，等待在工作台中确认。
- Prompt 记录：已增加调用日志和 JSONL 导出；正式基线前需先通过试评完整性检查。
- P0 正式基线：未开始，避免在标准答案冻结前产生无效基线。

## 目录说明

- `document_manifest.csv`：24 篇文献的稳定 ID、主题、文件类型和集合划分。
- `prompt_registry.csv`：产品内各类模型调用的 Prompt ID、环节和源代码。
- `tasks/*.csv`：30 张核心任务卡。
- `gold/pilot_gold.md`：S01、R01、W01 的预填标准与原文依据。
- `runs/_templates/`：每次运行需复制的记录模板。
- `reports/self_use_log_template.md`：人工对照与端到端自用记录模板。

## 执行顺序

1. 启动 ThesisFlow 和独立工作台。
2. 在工作台中选择当前开放的项目，并打开对应 ThesisFlow 页面完成实际操作。
3. 返回工作台点击核对项、填写问题和正确结论，保存到本地。
4. 回到 Codex，让 Codex 读取反馈、诊断原因并完成产品修改。
5. Codex 更新结果后，再次在工作台中确认修改是否解决问题。

静态完整性检查：

```bash
cd backend
.venv/bin/python scripts/check_p1_evaluation.py
```

## Prompt 日志使用

请求头：

```text
X-Evaluation-Run-Id: P1-PILOT-001
X-Evaluation-Task-Id: R01
```

导出指定运行的原始 Prompt 日志：

```text
GET /api/observability/prompt-calls?run_id=P1-PILOT-001
```

对外展示时使用 `include_content=false`，隐去 Prompt 和原始输出内容。
