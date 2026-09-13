"""P1 测评资产静态完整性检查。"""

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "evaluation" / "p1"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def require_unique(rows: list[dict[str, str]], field: str, label: str) -> None:
    values = [row[field] for row in rows]
    if len(values) != len(set(values)):
        raise AssertionError(f"{label} 的 {field} 存在重复")


def main() -> None:
    documents = read_csv(EVAL_DIR / "document_manifest.csv")
    if len(documents) != 24:
        raise AssertionError(f"文献数应为 24，实际为 {len(documents)}")
    require_unique(documents, "doc_id", "文献清单")
    require_unique(documents, "arxiv_id", "文献清单")

    task_ids: set[str] = set()
    for name, prefix in (("screening", "S"), ("reading", "R"), ("writing", "W")):
        rows = read_csv(EVAL_DIR / "tasks" / f"{name}.csv")
        if len(rows) != 10:
            raise AssertionError(f"{name} 任务数应为 10，实际为 {len(rows)}")
        require_unique(rows, "task_id", f"{name} 任务")
        if any(not row["task_id"].startswith(prefix) for row in rows):
            raise AssertionError(f"{name} 存在错误的任务编号")
        if sum(row["split"] == "dev" for row in rows) != 7:
            raise AssertionError(f"{name} dev 任务应为 7")
        if sum(row["split"] == "holdout" for row in rows) != 3:
            raise AssertionError(f"{name} holdout 任务应为 3")
        task_ids.update(row["task_id"] for row in rows)

    registry = read_csv(EVAL_DIR / "prompt_registry.csv")
    require_unique(registry, "prompt_template_id", "Prompt registry")
    if any(not row["version"] for row in registry):
        raise AssertionError("Prompt registry 存在未标版本的条目")

    pilot = (EVAL_DIR / "gold" / "pilot_gold.md").read_text(encoding="utf-8")
    for task_id in ("S01", "R01", "W01"):
        if task_id not in task_ids or f"## {task_id}" not in pilot:
            raise AssertionError(f"试评标准缺少 {task_id}")

    print(
        f"P1 测评资产检查通过：{len(documents)} 篇文献 / "
        f"{len(task_ids)} 个任务 / {len(registry)} 个 Prompt 模板"
    )


if __name__ == "__main__":
    main()
