"""独立的 ThesisFlow 测评优化人工协作工作台。"""

import ast
import csv
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
REPO_DIR = APP_DIR.parent
EVALUATION_DIR = REPO_DIR / "evaluation" / "p1"
TASK_DIR = EVALUATION_DIR / "tasks"
FEEDBACK_DIR = APP_DIR / "data" / "feedback"
STATIC_DIR = APP_DIR / "static"
THESISFLOW_URL = os.getenv("THESISFLOW_URL", "http://127.0.0.1:3000")
THESISFLOW_API_URL = os.getenv("THESISFLOW_API_URL", "http://127.0.0.1:8000")

app = FastAPI(title="测评优化人工协作工作台")

CATEGORY_META = {
    "screening": {
        "label": "文献筛选",
        "module": "ThesisFlow · 项目 · 文献整理",
        "module_path": "/projects/1/documents",
        "kind": "prompt",
        "prompt_ids": ["screening.score_and_recommend"],
        "review_intro": "逐篇判断推荐是否合理，并说明不符合研究目标的地方。",
    },
    "reading": {
        "label": "文献阅读",
        "module": "ThesisFlow · 项目 · 文献阅读器",
        "module_path": "/projects/1/documents",
        "kind": "hybrid",
        "prompt_ids": ["reading.pre_read", "reading.evidence_chat"],
        "review_intro": "对照论文原文，核对结论、证据位置和适用边界。",
    },
    "writing": {
        "label": "辅助写作",
        "module": "ThesisFlow · 项目 · 论文写作",
        "module_path": "/projects/1/writing",
        "kind": "hybrid",
        "prompt_ids": ["writing.continue", "writing.proposal", "verification.nli"],
        "review_intro": "判断文字能否直接使用，并核对引用、修改范围和学术边界。",
    },
}

RAG_RULES = [
    "同时进行语义召回与关键词召回",
    "用 RRF 合并两路候选结果",
    "根据文献质量和人工批注调整片段优先级",
    "用 reranker 重新排序",
    "优先装入父级完整语义块，并按长度预算截断",
    "生成内容只能引用实际装入上下文的证据编号",
]

REVIEW_FIELDS = {
    "screening": [
        {"key": "recommendation", "label": "推荐结论是否合理"},
        {"key": "reason", "label": "推荐或排除理由是否具体"},
        {"key": "missing_info", "label": "缺失信息是否被诚实标出"},
    ],
    "reading": [
        {"key": "claim", "label": "核心结论是否忠于原文"},
        {"key": "evidence", "label": "给出的证据能否在原文定位"},
        {"key": "boundary", "label": "适用范围和限制是否保留"},
        {"key": "fabrication", "label": "是否没有编造论文未提供的信息"},
    ],
    "writing": [
        {"key": "evidence", "label": "论述与引用是否对应"},
        {"key": "scope", "label": "是否只修改了要求修改的部分"},
        {"key": "boundary", "label": "结论是否保留必要边界"},
        {"key": "usability", "label": "文字经过少量修改能否使用"},
    ],
}

SYSTEM_PROMPT_SOURCE = "app.services.writing.build_system_prompt"


class FeedbackPayload(BaseModel):
    decision: str = Field(min_length=1, max_length=40)
    confidence: str = Field(default="一般", max_length=20)
    answers: dict = Field(default_factory=dict)
    observed_output: str = Field(default="", max_length=30000)
    output_ref: dict = Field(default_factory=dict)
    reviewer_note: str = Field(default="", max_length=12000)
    corrected_answer: str = Field(default="", max_length=20000)
    next_action: str = Field(default="", max_length=2000)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def prompt_registry() -> dict[str, dict[str, str]]:
    return {
        row["prompt_template_id"]: row
        for row in read_csv(EVALUATION_DIR / "prompt_registry.csv")
    }


def source_text(dotted_source: str) -> str:
    module_name, _, symbol_name = dotted_source.rpartition(".")
    source_path = REPO_DIR / "backend" / Path(*module_name.split(".")).with_suffix(".py")
    if not source_path.exists():
        return "当前模板无法自动读取。"
    source = source_path.read_text("utf-8")
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return "当前模板无法自动读取。"
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == symbol_name:
            if symbol_name == "build_system_prompt":
                return ast.get_source_segment(source, node) or "当前模板无法自动读取。"
            candidates = []
            for child in ast.walk(node):
                value = None
                if isinstance(child, ast.Return):
                    value = child.value
                elif isinstance(child, ast.Assign) and any(
                    isinstance(target, ast.Name) and target.id in {"prompt", "user_prompt"}
                    for target in child.targets
                ):
                    value = child.value
                if isinstance(value, (ast.JoinedStr, ast.Constant)):
                    segment = ast.get_source_segment(source, value)
                    if segment:
                        candidates.append(segment)
            if candidates:
                return max(candidates, key=len)
            return ast.get_source_segment(source, node) or "当前模板无法自动读取。"
    return "当前 Prompt 在调用位置动态组合，请根据来源文件查看。"


def prompt_details(prompt_ids: list[str]) -> list[dict]:
    registry = prompt_registry()
    details = []
    for prompt_id in prompt_ids:
        row = registry.get(prompt_id)
        if not row:
            continue
        details.append(
            {
                "id": prompt_id,
                "version": row["version"],
                "stage": row["stage"],
                "source": row["source"],
                "system_policy": row["system_prompt_policy"],
                "system_template": (
                    source_text(SYSTEM_PROMPT_SOURCE)
                    if row["system_prompt_policy"] != "none"
                    else "本次调用没有单独的 System Prompt。"
                ),
                "notes": row["notes"],
                "template": source_text(row["source"]),
            }
        )
    return details


def result_for(task_id: str, metric: str) -> dict:
    rows: list[dict[str, str]] = []
    runs_dir = EVALUATION_DIR / "runs"
    if runs_dir.exists():
        for path in runs_dir.glob("*/scores.csv"):
            if "_templates" in path.parts:
                continue
            rows.extend(row for row in read_csv(path) if row.get("task_id") == task_id)
    scored = [row for row in rows if row.get("passed", "").strip()]
    passed = sum(
        row["passed"].strip().lower() in {"1", "true", "yes", "通过"}
        for row in scored
    )
    accuracy = round(passed / len(scored) * 100, 1) if scored else None
    return {
        "metric": metric,
        "run_count": len(scored),
        "passed_count": passed,
        "accuracy": accuracy,
        "status": "已有初步结果" if scored else "尚无测试结果",
        "explanation": (
            "通过率只统计已由人工确认的运行。"
            if scored
            else "产品完成实际运行并经过人工审核后，这里才会显示通过率。"
        ),
    }


def feedback_status(task_id: str) -> dict:
    path = FEEDBACK_DIR / f"{task_id}.latest.json"
    if not path.exists():
        return {"saved": False, "saved_at": None, "decision": None}
    try:
        row = json.loads(path.read_text("utf-8"))
        return {"saved": True, "saved_at": row.get("saved_at"), "decision": row.get("decision")}
    except json.JSONDecodeError:
        return {"saved": False, "saved_at": None, "decision": None}


def reference_standard(task_id: str) -> str:
    path = EVALUATION_DIR / "gold" / "pilot_gold.md"
    if not path.exists():
        return ""
    source = path.read_text("utf-8")
    marker = f"## {task_id}："
    start = source.find(marker)
    if start < 0:
        return ""
    end = source.find("\n## ", start + len(marker))
    section = source[start : end if end >= 0 else len(source)]
    return section.strip()


def model_outputs(task_id: str) -> dict:
    query = urlencode({"task_id": task_id, "limit": 500})
    url = f"{THESISFLOW_API_URL}/api/observability/prompt-calls?{query}"
    api_error = None
    database_path = REPO_DIR / "backend" / "data" / "thesisflow.db"
    try:
        with urlopen(url, timeout=5) as response:
            body = response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        api_error = str(exc)
        body = ""

    rows = []
    for line in body.splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        output = row.get("raw_output")
        if output in (None, "") and row.get("error"):
            output = f"调用失败：{row['error']}"
        if output in (None, ""):
            continue
        rows.append(
            {
                "prompt_call_id": row.get("prompt_call_id"),
                "created_at": row.get("created_at"),
                "stage": row.get("stage"),
                "model": row.get("model"),
                "latency_ms": row.get("latency_ms"),
                "prompt_template_id": row.get("prompt_template_id"),
                "prompt_template_version": row.get("prompt_template_version"),
                "system_prompt": row.get("system_prompt_rendered"),
                "user_prompt": row.get("user_prompt_rendered"),
                "context_manifest": row.get("context_manifest"),
                "output": output if isinstance(output, str) else json.dumps(output, ensure_ascii=False, indent=2),
            }
        )

    if api_error:
        if database_path.exists():
            try:
                connection = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
                connection.row_factory = sqlite3.Row
                records = connection.execute(
                    "SELECT model, latency_ms, detail, created_at FROM user_logs "
                    "WHERE event_type = 'llm_call' ORDER BY id DESC LIMIT 5000"
                ).fetchall()
                connection.close()
                for record in records:
                    try:
                        detail = json.loads(record["detail"]) if isinstance(record["detail"], str) else record["detail"]
                    except json.JSONDecodeError:
                        continue
                    if not detail or detail.get("task_id") != task_id:
                        continue
                    output = detail.get("raw_output")
                    if output in (None, "") and detail.get("error"):
                        output = f"调用失败：{detail['error']}"
                    if output in (None, ""):
                        continue
                    rows.append(
                        {
                            "prompt_call_id": detail.get("prompt_call_id"),
                            "created_at": record["created_at"],
                            "stage": detail.get("stage"),
                            "model": record["model"],
                            "latency_ms": record["latency_ms"],
                            "prompt_template_id": detail.get("prompt_template_id"),
                            "prompt_template_version": detail.get("prompt_template_version"),
                            "system_prompt": detail.get("system_prompt_rendered"),
                            "user_prompt": detail.get("user_prompt_rendered"),
                            "context_manifest": detail.get("context_manifest"),
                            "output": output if isinstance(output, str) else json.dumps(output, ensure_ascii=False, indent=2),
                        }
                    )
            except sqlite3.Error:
                rows = []
    if not api_error:
        rows.reverse()
    return {
        "connected": not api_error or database_path.exists(),
        "status": "已读取当前模型输出" if rows else "等待生成结果",
        "message": (
            f"已找到 {len(rows)} 条与 {task_id} 关联的模型输出。"
            if rows
            else "该项尚未产生带任务编号的运行记录。请让 Codex 运行该项测试，完成后点击刷新。"
        ),
        "source": "local_database" if api_error else "local_api",
        "error": api_error,
        "outputs": rows,
    }


def friendly_status(raw: str) -> str:
    if "预填" in raw:
        return "等你确认"
    if "锁定" in raw:
        return "留到最后检查"
    return "等待人工审核"


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_DIR))
    except ValueError:
        return str(path)


def all_tasks() -> list[dict]:
    tasks = []
    for category in ("screening", "reading", "writing"):
        meta = CATEGORY_META[category]
        for row in read_csv(TASK_DIR / f"{category}.csv"):
            task_id = row["task_id"]
            tasks.append(
                {
                    "id": task_id,
                    "category": category,
                    "category_label": meta["label"],
                    "title": row["title"],
                    "instruction": row["instruction"],
                    "documents": row["documents"].split("|") if row["documents"] else [],
                    "metric": row["primary_metric"],
                    "status": friendly_status(row["gold_status"]),
                    "availability": "现在可以审核" if row["split"] == "dev" else "最终检查时开放",
                    "module": meta["module"],
                    "module_url": THESISFLOW_URL + meta["module_path"],
                    "kind": meta["kind"],
                    "review_intro": meta["review_intro"],
                    "review_fields": REVIEW_FIELDS[category],
                    "prompts": prompt_details(meta["prompt_ids"]),
                    "rag_rules": RAG_RULES if meta["kind"] == "hybrid" else [],
                    "result": result_for(task_id, row["primary_metric"]),
                    "feedback": feedback_status(task_id),
                    "reference_standard": reference_standard(task_id),
                }
            )
    return tasks


@app.get("/api/health")
def health():
    return {"ok": True, "product": "evaluation-workbench"}


@app.get("/api/tasks")
def list_tasks():
    tasks = all_tasks()
    return {
        "tasks": tasks,
        "summary": {
            "total": len(tasks),
            "available": sum(t["availability"] == "现在可以审核" for t in tasks),
            "reviewed": sum(t["feedback"]["saved"] for t in tasks),
            "with_results": sum(t["result"]["run_count"] > 0 for t in tasks),
        },
    }


@app.get("/api/feedback/{task_id}")
def get_feedback(task_id: str):
    if task_id not in {task["id"] for task in all_tasks()}:
        raise HTTPException(404, "没有找到这项审核工作")
    path = FEEDBACK_DIR / f"{task_id}.latest.json"
    if not path.exists():
        return {"task_id": task_id, "saved": False, "feedback": None}
    return {"task_id": task_id, "saved": True, "feedback": json.loads(path.read_text("utf-8"))}


@app.get("/api/outputs/{task_id}")
def get_outputs(task_id: str):
    if task_id not in {task["id"] for task in all_tasks()}:
        raise HTTPException(404, "没有找到这项审核工作")
    return {"task_id": task_id, **model_outputs(task_id)}


@app.put("/api/feedback/{task_id}")
def save_feedback(task_id: str, payload: FeedbackPayload):
    tasks = {task["id"]: task for task in all_tasks()}
    if task_id not in tasks:
        raise HTTPException(404, "没有找到这项审核工作")
    if tasks[task_id]["availability"] != "现在可以审核":
        raise HTTPException(409, "这项内容留到最后检查，当前不能填写")
    if not payload.observed_output.strip() or not payload.output_ref.get("prompt_call_id"):
        raise HTTPException(422, "尚未关联模型输出，不能提交审核")
    FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)
    saved_at = datetime.now(timezone.utc).isoformat()
    record = {
        "schema_version": "1.0",
        "task_id": task_id,
        "task_title": tasks[task_id]["title"],
        "category": tasks[task_id]["category"],
        "saved_at": saved_at,
        **payload.model_dump(),
    }
    rendered = json.dumps(record, ensure_ascii=False, indent=2) + "\n"
    safe_stamp = saved_at.replace(":", "-")
    history_path = FEEDBACK_DIR / f"{task_id}.{safe_stamp}.json"
    latest_path = FEEDBACK_DIR / f"{task_id}.latest.json"
    history_path.write_text(rendered, encoding="utf-8")
    temp_path = FEEDBACK_DIR / f".{task_id}.tmp"
    temp_path.write_text(rendered, encoding="utf-8")
    temp_path.replace(latest_path)
    return {
        "ok": True,
        "saved_at": saved_at,
        "local_file": display_path(latest_path),
        "message": "已保存到本地。回到 Codex 后，请让我读取工作台反馈并进行迭代。",
    }


@app.get("/")
def task_page():
    return FileResponse(STATIC_DIR / "tasks.html")


@app.get("/review")
def review_page():
    return FileResponse(STATIC_DIR / "review.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
