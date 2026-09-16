#!/usr/bin/env bash
# Rehearse the flagship investigation and the original challenge paths.
# Usage:
#   ./scripts/judge_demo.sh                         # default http://127.0.0.1:5001
#   ./scripts/judge_demo.sh http://127.0.0.1:5001
set -euo pipefail
BASE="${1:-http://127.0.0.1:5001}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$(mktemp -d /tmp/beamline-rehearsal-XXXXXX)"
trap 'rm -rf "$RUN_DIR"' EXIT

ask() {
  local label="$1" query="$2"
  echo
  echo "======== $label ========"
  echo "Q: $query"
  curl -sS -m 180 -X POST "$BASE/api/agent" \
    -H 'Content-Type: application/json' \
    -d "$(python3 -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$query")" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
if 'error' in d and not d.get('tools_used'):
    print('ERROR:', d.get('error'))
    sys.exit(1)
print('goal:       ', d.get('goal'))
print('plan:       ', d.get('plan'))
print('tools_used: ', d.get('tools_used'))
s, a = d.get('search'), d.get('answer')
if s:
    n = s.get('returned')
    title = (s['results'][0]['title'][:70] if s.get('results') else '—')
    print(f'search:      {n} hits  terms={s.get(\"search_terms\")!r}  broadened={s.get(\"broadened\")}  first={title}')
    p = d.get('picked') or {}
    if p:
        print(f'picked:      recid={p.get(\"recid\")}  usage={p.get(\"usage\")!r}  doi={p.get(\"doi\")!r}')
if a:
    ans = (a.get('answer') or '').replace('\n', ' ')
    print(f'answer:      grounded={a.get(\"grounded\")}  rail={a.get(\"guardrail\")}')
    print('             ', ans[:180])
    draft = (a.get('ungrounded_draft') or '').replace('\n', ' ')
    if draft:
        print('draft:      ', draft[:160])
"
}

echo "health:"
curl -sS -m 10 "$BASE/api/health" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('  cern', d.get('cern_api'), '| ollama', d.get('ollama'), d.get('ollama_model'),
      '| kb', d.get('knowledge_base'), d.get('knowledge_chunks'), 'chunks',
      '| ui', d.get('serving_frontend'))
"

echo
echo "======== flagship investigation ========"
curl -fsS -m 20 "$BASE/api/investigations/status" > "$RUN_DIR/status.json"
python3 - "$RUN_DIR/status.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['ready'], d.get('message')
m = d['manifest']
print('sample:      ', m['experiment'], '2012 reduced muons', f"{m['energy_tev']} TeV", f"{m['entries_read']:,} source entries")
print('identity:    ', m['sample_file'], m['sha256'][:16], 'DOI', m['doi'])
PY
curl -fsS -m 30 -X POST "$BASE/api/investigations/runs" -H 'Content-Type: application/json' \
  -d '{"spec":{"min_pt":0,"max_abs_eta":5,"charge":"opposite"}}' > "$RUN_DIR/baseline.json"
python3 - "$RUN_DIR/baseline.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print('baseline:    ', d['id'], f"{d['selected_events']:,} selected", f"{d['plotted_events']:,} plotted", f"{d['compute_ms']} ms")
PY
curl -fsS -m 20 -X POST "$BASE/api/investigations/suggest" -H 'Content-Type: application/json' \
  -d '{"query":"make both muons harder","spec":{"min_pt":0,"max_abs_eta":5,"charge":"opposite"}}' > "$RUN_DIR/suggestion.json"
python3 - "$RUN_DIR/suggestion.json" "$RUN_DIR/revision-request.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['action'] == 'selection'
print('command:     ', d['message'])
json.dump({'spec': d['spec']}, open(sys.argv[2], 'w'))
PY
curl -fsS -m 30 -X POST "$BASE/api/investigations/runs" -H 'Content-Type: application/json' \
  --data-binary "@$RUN_DIR/revision-request.json" > "$RUN_DIR/revision.json"
python3 - "$RUN_DIR/baseline.json" "$RUN_DIR/revision.json" <<'PY'
import json, sys
a, b = (json.load(open(path)) for path in sys.argv[1:])
delta = b['selected_events'] - a['selected_events']
print('revision:    ', b['id'], f"{b['selected_events']:,} selected", f"{delta:+,} vs original")
PY

echo
echo "======== CERN-grounded interpretation ========"
curl -fsS -m 180 -X POST "$BASE/api/ask" -H 'Content-Type: application/json' \
  -d '{"query":"What does the documented feature around 30 GeV in the CMS dimuon spectrum mean?"}' > "$RUN_DIR/explanation.json"
python3 - "$RUN_DIR/explanation.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['grounded'] and d['guardrail'] == 'grounded', d
used = [s for s in d['sources'] if s.get('used')]
print('answer:      ', d['answer'].replace('\n', ' ')[:260])
print('source:      ', used[0]['title'], used[0]['source'], 'score', used[0]['score'])
PY

echo
echo "======== reproducible handoff ========"
RUN_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$RUN_DIR/baseline.json")"
curl -fsS -m 60 "$BASE/api/investigations/runs/$RUN_ID/export" -o "$RUN_DIR/investigation.zip"
mkdir "$RUN_DIR/replay"
unzip -q "$RUN_DIR/investigation.zip" -d "$RUN_DIR/replay"
cd "$RUN_DIR/replay"
sha256sum -c SHA256SUMS >/dev/null
"$ROOT/backend/.venv/bin/python" reproduce.py
echo "bundle:       checksums valid; provenance + notebook + bounded sample present"
cd "$ROOT"

ask "1. dataset search" "proton-proton collisions at 13 TeV with muons"
ask "2. grounded Q&A" "Why does CMS use a solenoid?"
ask "3. refusal (no CERN source)" "How do black holes evaporate?"
echo
echo "done."
