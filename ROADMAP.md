# CERN Data Assistant — Roadmap (what’s left)

The challenge is: **natural-language CERN Open Data search + grounded detector/experiment Q&A**, using **RAG + Guardrails + an agent (AIQ-style)**.

Phases 0–5 are **done**. This file is only the remaining work, ordered for a hackathon: **demo first, then judged gaps, then nice-to-haves**.

---

## Status (already shipped)

| Piece | What judges can see |
|---|---|
| **Search** | NL → keywords → CERN Open Data → ranked dataset cards (size, format, DOI, citation, `cernopendata-client`, copy) |
| **RAG** | 1,185 chunks: seed + 45 CERN docs + 1,006 glossary terms; `nomic-embed-text` on the H100 |
| **Guardrails** | Input / retrieval floor / citations / LLM fact-check. No CERN source → no answer. Badge in the UI |
| **Agent** | `POST /api/agent` plans search and/or ask in one turn (the solenoid + datasets example) |
| **Polish** | Facets, CERN HTTP cache, unit tests, `qwen2.5:32b` with `llama3.2` fallback |

Laptop demo works today: UI `5173` + Flask `5001` + SSH tunnel `11434` → Ollama on LaunchPad.

**Not using** the NVIDIA **AIQ** or **NeMo Guardrails** packages — same *ideas*, our own code. Fine unless judges ask for the branded stack.

---

## Phase 6 — Demo-ready (DONE)

One reliable path for the pitch.

- ✅ H100 already serving UI+API via `scripts/start_h100.sh` (tmux `app`, gunicorn `:5001`, `qwen2.5:32b`, 1633 chunks).
- ✅ Laptop tunnels **5001** only: `ssh -N -L 5001:127.0.0.1:5001 launchpad-cern` → http://127.0.0.1:5001
- ✅ `scripts/warm_h100.sh` keeps 32B + embed model loaded.
- ✅ [DEMO.md](DEMO.md) + `scripts/judge_demo.sh` — four queries rehearsed live:
  - datasets → search (ATLAS 13 TeV muon ntuples)
  - solenoid → grounded
  - both tools → search + ask
  - black holes → `retrieval:no_source` refusal
- ✅ README diagram: demo (one port) vs laptop-dev (Ollama tunnel).

---

## Phase 7 — Agent that looks more like AIQ (DONE)

Three tools, visible plan, retry if CERN returns nothing.

- ✅ **`fetch_record`** — after search, `GET` the top dataset; stitch example files + license onto that card (`picked` badge).
- ✅ **Retry** — if search is empty after broadening, drop `N TeV` (or fall back to CMS/ATLAS/ALICE/LHCb) and search again; UI marks `(retried)`.
- ✅ **Plan chips** — console shows `search: …` and `ask: …` plus tools `dataset search` / `grounded answer` / `fetch record`.
- Skipped NVIDIA AIQ package (same tools, our orchestrator).

---

## Phase 8 — Grounding that survives a hostile question

Guardrails work; a few holes remain.

1. **Calibrate `RAG_MIN_SCORE` on the new 1,185-chunk index** (floor is 0.65 from the old 60-chunk corpus). Re-run on-topic vs off-topic; tune so solenoid still answers and pasta still refuses.
2. **Expand `seed.json`** for the exact demo questions (CMS solenoid, MiniAOD vs NanoAOD, 13 TeV, ATLAS magnet) so retrieval isn’t glossary-only.
3. **Cite-or-refuse in the UI** even when `grounded:low_confidence` — judges should never see a naked physics claim.
4. **Skip NeMo Guardrails** unless you have spare time; Colang + NIM is a day, and you already fact-check.

---

## Phase 9 — Only if there is time

- Streaming tokens so the 32B model doesn’t look “stuck”.
- In-app **record preview** (file list from `/api/record/<id>`).
- Follow-up chat (“and the ATLAS one?”) — needs session memory.
- Facets **sent to CERN** (`experiment:CMS`, energy) instead of filter-after-fetch.
- A couple of mocked `ollama_client` tests.

---

## Suggested order for the rest of the lab

```
Phase 6 (H100 demo + 4-query script)   ← DONE
     ↓
Phase 7.1–7.3 (record tool + visible plan)  ← DONE
     ↓
Phase 8.1–8.2 (recalibrate floor + seed the demo questions)
     ↓
Phase 9 only if the pitch is already smooth
```
