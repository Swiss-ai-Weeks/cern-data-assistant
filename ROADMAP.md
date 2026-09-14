# CERN Data Assistant — Roadmap (what’s left)

The challenge is: **natural-language CERN Open Data search + grounded detector/experiment Q&A**, using **RAG + Guardrails + an agent (AIQ-style)**.

Phases 0–5 are **done**. This file is only the remaining work, ordered for a hackathon: **demo first, then judged gaps, then nice-to-haves**.

---

## Status (already shipped)

| Piece | What judges can see |
|---|---|
| **Search** | NL → keywords → CERN Open Data → ranked dataset cards (size, format, DOI, citation, `cernopendata-client`, copy) |
| **RAG** | 1,636 chunks: 18 seed facts + 78 CERN docs (612 chunks) + 1,006 glossary terms; `nomic-embed-text` on the H100 |
| **Guardrails** | Input / retrieval floor / citations / LLM fact-check. No CERN source → no answer. Badge in the UI |
| **Agent** | `POST /api/agent` plans search and/or ask in one turn (the solenoid + datasets example) |
| **Polish** | Facets, CERN HTTP cache, unit tests, `qwen2.5:32b` with `llama3.2` fallback |

## Product surface (DONE)

Chat-first app, not a three-tab prototype:
- Live **tool timeline** over `POST /api/agent/stream` (plan → search → grounded answer → fetch record).
- **Follow-up conversation** (planner sees prior turns; suggested next questions).
- **Dataset inspector** — click a card to open the full CERN record + file list.
- Health poll, knowledge-base size in the header.

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

## Phase 8 — Grounding that survives a hostile question (DONE)

- ✅ **Floor recalibrated on the 1,636-chunk index** with two batteries: 15 on-topic questions score ≥ 0.756,
  10 off-topic ("black holes", "Hawking radiation", "speed of light", "cook pasta", "World Cup"…) ≤ 0.660
  → `RAG_MIN_SCORE=0.70`, low-confidence band 0.70–0.75 (~0.04 headroom on both sides).
- ✅ **`seed.json` covers the demo questions**, tagged with experiment: CMS solenoid, ATLAS magnet, MiniAOD vs
  NanoAOD, LHC Run 2 / 13 TeV pp, what a dataset record contains, pile-up, ALICE TPC, LHCb forward spectrometer.
- ✅ **Cite-or-refuse in the low-confidence band**, two rails: `guardrails.strip_uncited_sentences` drops every
  sentence without a `[n]` (UI shows "n uncited sentence(s) dropped"; nothing left → `citation:none`), and at
  least one cited passage must itself clear the floor or we refuse (`grounding:low_confidence`).
- ✅ **Fact-check made reproducible**: verifier runs at temperature 0 and a lexical arbiter vetoes flags on
  sentences that are paraphrases of the cited passage (it refused "MiniAOD vs NanoAOD" 1 run in 3 before).
- Skipped NeMo Guardrails (own rails + LLM fact-check already cover it).

---

## Phase 9 — Only if there is time

- Streaming tokens so the 32B model doesn’t look “stuck”.
- In-app **record preview** for every row (top hit already fetched by the agent).
- Follow-up chat (“and the ATLAS one?”) — needs session memory.
- ✅ Facets **sent to CERN** (`collision_energy`, `collision_type`, `experiment`, `type=Dataset`) extracted
  deterministically from the request; keywords stripped of facet words; facet ladder when empty; CMS
  primary-dataset aliases ("muons" → DoubleMuon/SingleMuon); collision-first pool ordering; cards now show
  energy / collision type / run period from `collision_information`. "proton-proton collisions at 13 TeV with
  muons" → DoubleMuon 2016 NanoAOD/MiniAOD instead of 1 hit. (`subtype` is ignored by the portal API.)
- ✅ Mocked `ollama_client` tests (`tests/test_ollama_client.py`) + facet tests (`tests/test_facets.py`), 55 total.

---

## Suggested order for the rest of the lab

```
Phase 6 (H100 demo + 4-query script)   ← DONE
     ↓
Phase 7.1–7.3 (record tool + visible plan)  ← DONE
     ↓
Phase 8 (recalibrate floor + seed + cite-or-refuse)  ← DONE
     ↓
Phase 9 only if the pitch is already smooth
```
