#!/bin/zsh
set -e
cd "$(dirname "$0")"

if [ ! -f backend/.env ]; then
  echo "请先配置 backend/.env（参考 backend/.env.example）"
  exit 1
fi

echo "[1/2] 启动后端 (http://localhost:8000)…"
python3 backend/serve.py
sleep 2
curl -s http://localhost:8000/health -o /dev/null -w "后端健康检查: %{http_code}\n"

echo "[2/2] 启动前端 (http://localhost:3000)…"
if ! pgrep -f "next dev" > /dev/null; then
  cd frontend
  nohup npm run dev > /tmp/tf_frontend.log 2>&1 < /dev/null &
  cd ..
fi
sleep 6
curl -s http://localhost:3000 -o /dev/null -w "前端健康检查: %{http_code}\n"
echo "完成：浏览器打开 http://localhost:3000"
