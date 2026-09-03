#!/bin/zsh
pkill -f "uvicorn app.main:app" 2>/dev/null && echo "后端已停止" || echo "后端未在运行"
pkill -f "next dev" 2>/dev/null && echo "前端已停止" || echo "前端未在运行"
