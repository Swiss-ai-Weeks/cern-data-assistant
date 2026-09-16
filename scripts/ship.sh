#!/usr/bin/env bash
# Local production check: frontend build + backend tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ">> frontend build"
cd "$ROOT/frontend"
npm ci --silent 2>/dev/null || npm install --silent
npm run build

echo ">> backend tests"
cd "$ROOT/backend"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt pytest
python -m pytest tests/ -q

echo ">> product gates"
bash ../scripts/run_product_checks.sh

echo ">> OK — deploy with SERVE_FRONTEND=1"
