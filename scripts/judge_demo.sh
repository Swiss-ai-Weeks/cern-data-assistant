#!/usr/bin/env bash
# End-to-end release rehearsal against a running Beamline origin.
set -euo pipefail
BASE="${1:-http://127.0.0.1:5001}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d /tmp/beamline-judge-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

post() {
  curl -fsS -m 180 -X POST "$BASE$1" -H 'Content-Type: application/json' -d "$2"
}

echo "== service and release gates =="
curl -fsS -m 20 "$BASE/api/health" > "$WORK/health.json"
curl -fsS -m 20 "$BASE/api/investigations/product-summary" > "$WORK/summary.json"
python3 - "$WORK/health.json" "$WORK/summary.json" <<'PY'
import json, sys
h, s = (json.load(open(path)) for path in sys.argv[1:])
assert h['cern_api'] == 'ok' and h['ollama'] == 'ok' and h['knowledge_base'] == 'ready'
assert h['investigation']['sample_prepared'] and s['investigation']['day_one_gate_passed']
assert s['eval_cases_frozen'] == 30 and s['feature_freeze_core']
t = s['baseline_timings']
assert t['method'] == 'live_api_staged_sample' and t['sample']['entries_read'] == 500000
print('catalog/model/index:', h['cern_api'], h['ollama_model'], h['knowledge_chunks'])
print('live timing p50/p95:', t['fresh_compute_ms']['p50'], t['fresh_compute_ms']['p95'], 'ms')
PY

echo "== three consecutive queued analyses =="
for pt in 0 10 15; do
  post /api/investigations/jobs "{\"spec\":{\"min_pt\":$pt,\"max_abs_eta\":5,\"charge\":\"opposite\"}}" > "$WORK/run-$pt.json"
done
python3 - "$WORK/run-0.json" "$WORK/run-10.json" "$WORK/run-15.json" <<'PY'
import json, sys
runs = [json.load(open(path))['run'] for path in sys.argv[1:]]
assert all(run and run['selected_events'] >= 0 for run in runs)
assert runs[0]['selected_events'] > runs[1]['selected_events'] > runs[2]['selected_events']
for run in runs: print(run['id'], run['spec']['min_pt'], f"{run['selected_events']:,}", 'selected')
PY

BASELINE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["run"]["id"])' "$WORK/run-0.json")"
REVISION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["run"]["id"])' "$WORK/run-10.json")"

echo "== persisted session, comparison, and claims =="
post /api/investigations/sessions '{"spec":{"min_pt":10,"max_abs_eta":5,"charge":"opposite"}}' > "$WORK/session.json"
SESSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$WORK/session.json")"
curl -fsS -m 20 -X PUT "$BASE/api/investigations/sessions/$SESSION" -H 'Content-Type: application/json' \
  -d "{\"spec\":{\"min_pt\":10,\"max_abs_eta\":5,\"charge\":\"opposite\"},\"active_run_id\":\"$REVISION\",\"baseline_run_id\":\"$BASELINE\",\"run_ids\":[\"$BASELINE\",\"$REVISION\"]}" > "$WORK/saved.json"
curl -fsS -m 20 "$BASE/api/investigations/sessions/$SESSION/brief" > "$WORK/brief.json"
python3 - "$WORK/brief.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['active_run']['spec']['min_pt'] == 10 and d['baseline_run']['spec']['min_pt'] == 0
assert d['comparison']['selected_events_delta'] < 0 and len(d['claims']) >= 4
labels = {c['evidence_label'] for c in d['claims']}
assert {'calculated', 'documented', 'not_established'} <= labels
print('restored:', d['session']['id'], 'delta', f"{d['comparison']['selected_events_delta']:,}", 'claims', len(d['claims']))
PY

echo "== tamper-evident export replay =="
curl -fsS -m 90 "$BASE/api/investigations/runs/$REVISION/export?baseline=$BASELINE" -o "$WORK/export.zip"
mkdir "$WORK/replay"
unzip -q "$WORK/export.zip" -d "$WORK/replay"
(cd "$WORK/replay" && sha256sum -c SHA256SUMS >/dev/null && "$ROOT/backend/.venv/bin/python" reproduce.py)
python3 - "$WORK/replay/provenance.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['sample_sha256'] and d['recipe_sha256'] and d['run_id']
print('provenance:', d['run_id'], d['source_doi'])
PY

echo "== challenge coverage and integrity rail =="
post /api/agent '{"query":"I need proton-proton collisions at 13 TeV with muons"}' > "$WORK/search.json"
post /api/ask '{"query":"Why does CMS use a solenoid?"}' > "$WORK/solenoid.json"
post /api/ask '{"query":"How do black holes evaporate?"}' > "$WORK/refusal.json"
python3 - "$WORK/search.json" "$WORK/solenoid.json" "$WORK/refusal.json" <<'PY'
import json, sys
search, answer, refusal = (json.load(open(path)) for path in sys.argv[1:])
assert str(search['picked']['recid']) == '30555'
assert answer['grounded'] and any(s.get('used') for s in answer['sources'])
assert not refusal['grounded'] and refusal['guardrail'] == 'retrieval:no_source'
print('13 TeV record:', search['picked']['recid'])
print('solenoid:', answer['guardrail'], '| refusal:', refusal['guardrail'])
PY

echo "ALL JUDGE GATES PASSED"
