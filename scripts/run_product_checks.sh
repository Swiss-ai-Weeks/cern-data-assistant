#!/usr/bin/env bash
# Fast product gate: investigation eval, smoke, export replay.
set -euo pipefail
cd "$(dirname "$0")/../backend"
# shellcheck disable=SC1091
[[ -f .venv/bin/activate ]] && source .venv/bin/activate
python -m pytest -q \
  tests/test_eval_frozen.py \
  tests/test_product_smoke.py \
  tests/test_job_reconnect.py \
  tests/test_investigation_commands.py \
  tests/test_investigation_metrics.py \
  tests/test_investigation_journey.py \
  tests/test_claims.py \
  tests/test_investigation_agent.py \
  tests/test_agent_investigation_route.py \
  tests/test_eval_paraphrase.py \
  tests/test_session_brief.py \
  tests/test_export_baseline.py \
  tests/test_provenance.py \
  tests/test_claims_resolve.py \
  tests/test_worker_sync.py \
  tests/test_beginner_checklist.py \
  tests/test_day_one_gate.py \
  tests/test_product_summary.py \
  tests/test_beginner_journey.py
python ../scripts/capture_baseline_timings.py
