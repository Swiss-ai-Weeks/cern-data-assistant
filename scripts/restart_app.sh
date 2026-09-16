#!/usr/bin/env bash
# Restart Beamline on the GPU box after git pull (same tmux session as start_h100.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

pkill -f "gunicorn.*app:app" 2>/dev/null || true
sleep 1

cd "$ROOT/frontend"
if [[ ! -d dist ]]; then
  npm install --legacy-peer-deps --no-audit --no-fund
  npm run build
fi

cd "$ROOT/backend"
# shellcheck disable=SC1091
[[ -f .venv/bin/activate ]] && source .venv/bin/activate
export PUBLIC_DEMO_URL="${PUBLIC_DEMO_URL:-}"
export GUNICORN_WORKERS="${GUNICORN_WORKERS:-1}"
PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2)
PORT=${PORT:-5001}
echo ">> restarting gunicorn on 127.0.0.1:$PORT"
exec gunicorn -w "$GUNICORN_WORKERS" --threads 4 -b "127.0.0.1:$PORT" --timeout 300 --access-logfile - app:app
