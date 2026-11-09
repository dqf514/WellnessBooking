#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .dev
if [[ ! -x backend/.venv/Scripts/python.exe ]]; then
  python -m venv backend/.venv
  backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
fi
if [[ ! -d node_modules ]]; then
  npm install
fi
backend/.venv/Scripts/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 38734 --app-dir backend > .dev/backend.log 2>&1 &
echo $! > .dev/backend.pid
npm run dev -- --host 127.0.0.1 > .dev/frontend.log 2>&1 &
echo $! > .dev/frontend.pid
echo "会员端：http://127.0.0.1:38733"
echo "员工端：http://127.0.0.1:38733/login"
echo "管理员：admin / admin123"
