#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -x "$SCRIPT_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$SCRIPT_DIR/.venv/bin/python"
elif [ -x "$SCRIPT_DIR/../backend/.venv/bin/python" ]; then
  PYTHON_BIN="$SCRIPT_DIR/../backend/.venv/bin/python"
else
  echo "未找到 Python 环境。请先在 evaluation-workbench/.venv 安装 pyproject.toml 中的依赖。"
  exit 1
fi

cd "$SCRIPT_DIR"
exec "$PYTHON_BIN" -m uvicorn app:app --host 127.0.0.1 --port 8010
