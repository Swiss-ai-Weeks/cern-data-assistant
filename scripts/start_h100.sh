#!/usr/bin/env bash
# Start the whole CERN Data Assistant on the LaunchPad H100:
#   Ollama (LLM + embeddings) -> RAG index -> built React UI -> Flask/gunicorn on :5001
#
# Usage (on the GPU node, ideally inside `tmux new -s app`):
#   scripts/start_h100.sh            # start everything (idempotent)
#   scripts/start_h100.sh --rebuild  # also rebuild the RAG index and the UI bundle
#
# Then from a laptop:  ssh -L 5001:127.0.0.1:5001 launchpad   ->  http://localhost:5001
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
REBUILD=0
[[ "${1:-}" == "--rebuild" ]] && REBUILD=1

# ---- 1. Ollama ---------------------------------------------------------------
if ! curl -sf 127.0.0.1:11434/api/tags >/dev/null; then
  echo ">> starting ollama serve"
  nohup env OLLAMA_KEEP_ALIVE=-1 ollama serve > "$HOME/ollama.log" 2>&1 &
  for _ in $(seq 1 20); do curl -sf 127.0.0.1:11434/api/tags >/dev/null && break; sleep 1; done
fi

# ---- 2. Backend env + venv ---------------------------------------------------
cd "$ROOT/backend"
if [[ ! -f .env ]]; then
  echo ">> creating backend/.env for the H100"
  cp .env.example .env
  sed -i 's#^OLLAMA_HOST=.*#OLLAMA_HOST=http://127.0.0.1:11434#; s#^OLLAMA_MODEL=.*#OLLAMA_MODEL=qwen2.5:32b#; s#^SERVE_FRONTEND=.*#SERVE_FRONTEND=1#; s#^FLASK_DEBUG=.*#FLASK_DEBUG=0#' .env
fi
MODEL=$(grep -E '^OLLAMA_MODEL=' .env | cut -d= -f2)
EMBED=$(grep -E '^OLLAMA_EMBED_MODEL=' .env | cut -d= -f2); EMBED=${EMBED:-nomic-embed-text}
ollama list | grep -q "^${EMBED}" || ollama pull "$EMBED"
ollama list | grep -q "^${MODEL}" || ollama pull "$MODEL"

if [[ ! -d .venv ]]; then
  echo ">> creating venv"
  python3 -m venv .venv || { echo "venv failed; try: apt install python3-venv"; exit 1; }
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt

# ---- 3. RAG index ------------------------------------------------------------
if [[ $REBUILD == 1 || ! -f knowledge/index.npy ]]; then
  echo ">> building RAG index"
  python build_index.py
fi

# ---- 4. Frontend bundle ------------------------------------------------------
cd "$ROOT/frontend"
if [[ $REBUILD == 1 || ! -d dist ]]; then
  echo ">> building frontend"
  [[ -d node_modules/.bin ]] || npm install --legacy-peer-deps --no-audit --no-fund
  npm run build
fi

# ---- 5. Warm the LLM so the first demo question is fast ----------------------
cd "$ROOT/backend"
echo ">> warming $MODEL"
curl -s 127.0.0.1:11434/api/chat -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":false,\"keep_alive\":-1}" >/dev/null || true
curl -s 127.0.0.1:11434/api/embed -d "{\"model\":\"$EMBED\",\"input\":\"warm\",\"keep_alive\":-1}" >/dev/null || true

# ---- 6. Serve UI + API on :5001 ----------------------------------------------
PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-5001}
echo ">> serving on http://127.0.0.1:$PORT  (tunnel: ssh -L $PORT:127.0.0.1:$PORT launchpad)"
WORKERS=${GUNICORN_WORKERS:-1}
echo ">> gunicorn workers=$WORKERS (set GUNICORN_WORKERS=1 for investigation job queue)"
export GUNICORN_WORKERS="$WORKERS"
exec gunicorn -w "$WORKERS" --threads 4 -b "127.0.0.1:$PORT" --timeout 300 --access-logfile - app:app
