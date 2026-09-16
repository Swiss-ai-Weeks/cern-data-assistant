#!/usr/bin/env bash
# Restart Beamline on the GPU box after git pull.
#   ./scripts/restart_app.sh              # foreground (tmux)
#   ./scripts/restart_app.sh --background # nohup for one-shot SSH deploy
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
BACKGROUND=0
[[ "${1:-}" == "--background" ]] && BACKGROUND=1

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
LOG="${HOME}/beamline-gunicorn.log"
CMD=(gunicorn -w "$GUNICORN_WORKERS" --threads 4 -b "127.0.0.1:$PORT" --timeout 300 --access-logfile - app:app)
if [[ $BACKGROUND == 1 ]]; then
  echo ">> starting gunicorn in background on 127.0.0.1:$PORT (log: $LOG)"
  nohup "${CMD[@]}" >"$LOG" 2>&1 &
  for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && exit 0
    sleep 1
  done
  echo "gunicorn did not become healthy; see $LOG" >&2
  exit 1
fi
echo ">> restarting gunicorn on 127.0.0.1:$PORT"
exec "${CMD[@]}"
