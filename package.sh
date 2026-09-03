#!/bin/bash
# ThesisFlow 作品集打包脚本
# 生成网申投递用 zip：完整项目 + 种子数据，剔除依赖目录/密钥/缓存/系统文件
set -euo pipefail
cd "$(dirname "$0")"

OUT="ThesisFlow_Portfolio_$(date +%Y%m%d).zip"
rm -f ThesisFlow_Portfolio_*.zip

zip -r "$OUT" . \
  -x ".git/*" ".gitignore" \
  -x "backend/.env" \
  -x "backend/.venv/*" \
  -x "backend/**/__pycache__/*" \
  -x "backend/data/exports/*" \
  -x "frontend/node_modules/*" \
  -x "frontend/.next/*" \
  -x "frontend/.env.local" \
  -x ".DS_Store" "*/.DS_Store" \
  -x "*.pyc"

echo "✓ 已生成: $OUT"
echo "  含完整代码 + samples + backend/data 种子数据（可开箱演示）"
echo "  已剔除: .env(密钥) / .venv / node_modules / .next / __pycache__ / .DS_Store"
echo "  注意: 接收方需自备 DEEPSEEK_API_KEY 与 DASHSCOPE_API_KEY（backend/.env.example 为模板）"
