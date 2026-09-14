#!/usr/bin/env bash
# Rehearse the four judge queries against a running Beamline API.
# Usage:
#   ./scripts/judge_demo.sh                         # default http://127.0.0.1:5001
#   ./scripts/judge_demo.sh http://127.0.0.1:5001
set -euo pipefail
BASE="${1:-http://127.0.0.1:5001}"

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
if a:
    ans = (a.get('answer') or '').replace('\n', ' ')
    print(f'answer:      grounded={a.get(\"grounded\")}  rail={a.get(\"guardrail\")}')
    print('             ', ans[:180])
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

ask "1. dataset search" "proton-proton collisions at 13 TeV with muons"
ask "2. grounded Q&A" "Why does CMS use a solenoid?"
ask "3. agent (both tools)" "find CMS muon datasets and explain why CMS uses a solenoid"
ask "4. refusal (no CERN source)" "How do black holes evaporate?"
echo
echo "done."
