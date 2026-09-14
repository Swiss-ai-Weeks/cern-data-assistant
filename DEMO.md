# Judge demo — 4 queries (rehearse once)

Pitch in ~3 minutes. Open **http://127.0.0.1:5001** (H100 via SSH tunnel). Paper UI: thread on the left, stage on the right. Click a launch tile. Watch Plan → Search → Ground → Fetch. Datasets land as soon as search returns. Click a tile to inspect files. Click a thread message to put that turn back on the stage.

If the first answer hangs: the 32B model is still loading. Wait, or run `scripts/warm_h100.sh` on the GPU box first.

---

## 1. Dataset search (~30s)

Type:

> proton-proton collisions at 13 TeV with muons

**Say:** natural language in, CERN Open Data out. Cards show size, format, how to download, citation. Facets if you need them.

**Expect:** `tools_used: search`, real CMS/ATLAS datasets, not a glossary page.

---

## 2. Grounded detector question (~40s)

> Why does CMS use a solenoid?

**Say:** this is RAG. The answer is grounded in CERN sources; every `[n]` is a real portal page. Guardrails refuse if nothing in the index supports it.

**Expect:** `grounded: true`, citations, rail `grounded` or `grounded:low_confidence`.

---

## 3. Agent (both tools) (~50s) — the AIQ slide

> find CMS muon datasets and explain why CMS uses a solenoid

**Say:** one box, two tools. The planner splits the request: dataset search **and** grounded Q&A in a single turn.

**Expect:** `tools_used: [search, ask]`, an answer card **and** a result list.

---

## 4. Refusal (~20s) — the money shot

> How do black holes evaporate?

(Backup: `What is the best way to cook pasta?`)

**Say:** no CERN source → no physics. We would rather refuse than hallucinate Hawking radiation.

**Expect:** `grounded: false`, rail like `retrieval:no_source` or `citation:none`. **Not** a confident cosmology lecture.

---

## If something dies

| Symptom | Fix |
|---|---|
| UI won't load | On laptop: `ssh -N -L 5001:127.0.0.1:5001 launchpad-cern` |
| `ollama offline` / slow first token | On H100: `tmux attach -t app` then `scripts/start_h100.sh` |
| Empty knowledge | On H100: `scripts/start_h100.sh --rebuild` |

Rehearse the four queries without talking:

```bash
# laptop, tunnel up:
./scripts/judge_demo.sh
# or against the GPU box:
ssh launchpad-cern 'cd ~/cern-data-assistant && ./scripts/judge_demo.sh http://127.0.0.1:5001'
```
