# 测评优化人工协作工作台

这是一个与 ThesisFlow 独立运行的小产品，用于查看每项能力的测评现状，并收集人工审核反馈。它不会修改 ThesisFlow、Prompt、RAG 规则或模型。

## 两个页面

- `http://127.0.0.1:8010/`：查看任务、对应产品模块、当前 Prompt、RAG 规则和测试结果。
- `http://127.0.0.1:8010/review`：自动读取当前模型输出，按照不同任务类型完成可视化审核并保存反馈。

文献筛选任务会把模型评分解析为可编辑审核表：左侧说明每个指标的核对方法，中间保留模型原始判断，右侧记录人工确认或修正。涉及阅读预算时，页面同时显示跨文献队列和预算计数。

## 启动

如果已经安装 ThesisFlow 后端环境，可直接运行：

```bash
cd evaluation-workbench
./start.sh
```

工作台默认运行在 `127.0.0.1:8010`，ThesisFlow 仍运行在 `127.0.0.1:3000`，两者互不共享后端服务。工作台通过只读接口从 `127.0.0.1:8000` 获取已经关联任务编号的模型运行记录；不会向 ThesisFlow 写入数据。

人工审核前由 Codex 或测评程序运行待检查项目。运行产生的模型输出、System/User Prompt、上下文记录和调用编号会自动显示在人工审核页，不需要从 ThesisFlow 复制粘贴。

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
- 保存内容自动包含所审核的模型输出和 Prompt 调用编号，保证反馈与具体输出一一对应。
- 反馈 JSON 已被 `.gitignore` 排除，不会上传 GitHub。

完成审核后回到 Codex，说明“读取工作台反馈并进行迭代”即可。
