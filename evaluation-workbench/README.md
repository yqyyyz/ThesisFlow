# 测评优化人工协作工作台

这是一个与 ThesisFlow 独立运行的小产品，用于查看每项能力的测评现状，并收集人工审核反馈。它不会修改 ThesisFlow、Prompt、RAG 规则或模型。

## 两个页面

- `http://127.0.0.1:8010/`：查看任务、对应产品模块、当前 Prompt、RAG 规则和测试结果。
- `http://127.0.0.1:8010/review`：按照不同任务类型完成可视化审核并保存反馈。

## 启动

如果已经安装 ThesisFlow 后端环境，可直接运行：

```bash
cd evaluation-workbench
./start.sh
```

工作台默认运行在 `127.0.0.1:8010`，ThesisFlow 仍运行在 `127.0.0.1:3000`，两者互不共享后端服务。

如果要完全独立安装环境：

```bash
cd evaluation-workbench
python3 -m venv .venv
.venv/bin/pip install -e .
./start.sh
```

## 本地反馈

审核结果保存在 `evaluation-workbench/data/feedback/`：

- `<编号>.latest.json` 是最新反馈。
- `<编号>.<时间>.json` 是历史记录。
- 反馈 JSON 已被 `.gitignore` 排除，不会上传 GitHub。

完成审核后回到 Codex，说明“读取工作台反馈并进行迭代”即可。
