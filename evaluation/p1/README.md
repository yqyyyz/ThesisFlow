# ThesisFlow P1 测评执行包

本目录是 [ThesisFlow P1 产品测评方案](../../ThesisFlow_P1_产品测评方案.md) 的可执行资产包。

## 当前状态

- 方案：已审核通过。
- 文献清单：24 篇已编号并完成初始 dev/holdout 划分。
- 任务卡：S01–S10、R01–R10、W01–W10 已建立。
- 试评卡：S01、R01、W01 已预填，等待测评负责人确认学术标准。
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

1. 由测评负责人审核 `gold/pilot_gold.md`。
2. 启动产品，对 S01、R01、W01 发起试评请求，携带测评请求头。
3. 导出 Prompt 调用日志，检查 System Prompt、User Prompt、messages、上下文与输出是否完整。
4. 仅修正任务卡、日志或评分表缺陷，不根据试评结果调优产品。
5. 预填其余标准答案并完成人工审核，随后冻结测评集。
6. 建立 P0 基线。

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
