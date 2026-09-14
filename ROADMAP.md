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

## Phase 6 — Demo-ready (do this next)

One reliable path for the pitch. Highest ROI.

1. **Run on the H100** with `scripts/start_h100.sh` (tmux). Laptop only tunnels **5001**. Drops the 3-process laptop stack.
2. **Warm `qwen2.5:32b`** before anyone walks up (script already curls a dummy chat). First real question otherwise waits on GPU load.
3. **Judge script** (rehearse, 4 queries, say the rail out loud):
   - *“proton-proton collisions at 13 TeV with muons”* → datasets
   - *“Why does CMS use a solenoid?”* → grounded + citations
   - *“find CMS muon datasets and explain why CMS uses a solenoid”* → **both tools**
   - *“How do black holes evaporate?”* or pasta → **refusal** (the money shot)
4. **Fix README drift**: diagram still says llama3.2 / laptop-only; align with 32B + optional H100 serve.
5. **Pre-pull on the GPU box** if a teammate’s clone is empty: `qwen2.5:32b`, `llama3.2`, `nomic-embed-text`.

Skip [Brev CLI](https://github.com/brevdev/brev-cli) unless you leave LaunchPad. You already have the H100.

---

## Phase 7 — Agent that looks more like AIQ

The planner is one-shot. A judge who knows agentic stacks will ask “what are the tools?”

1. **`fetch_record` tool** — after search, pull `GET /api/record/<recid>` and use files/size in the answer (“here’s how to download this one”).
2. **Retry loop** — if search returns 0 after broadening, re-plan with fewer constraints instead of an empty feed.
3. **Show the plan** more clearly in the UI (already have `goal` + `tools_used`; add the actual `search_query` / `ask_query` chips).
4. **Optional, only if a mentor insists on the NVIDIA name:** wrap the same three tools in NVIDIA AIQ. Do **not** rewrite the app for this unless required.

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
Phase 6 (H100 demo + 4-query script)   ← do now
     ↓
Phase 7.1–7.3 (record tool + visible plan)
     ↓
Phase 8.1–8.2 (recalibrate floor + seed the demo questions)
     ↓
Phase 9 only if the pitch is already smooth
```

Do **not** start Brev, NeMo, or a full AIQ port until Phase 6 is rehearsed once without the tunnel dying.
