# CERN Data Assistant — Roadmap

Goal: turn Beamline (natural-language dataset search) into the full **CERN Data Assistant** the challenge asks for — grounded answers about **datasets** *and* **detectors/experiments**, using **RAG + AIQ + Guardrails**.

## Phase 0 — Wiring (DONE)
- NL query → `llama3.2` on the LaunchPad H100 extracts search terms.
- CERN Open Data search → LLM ranks hits with a one-line reason.
- Flask API (`5001`) + React UI (`5173`) on the laptop; Ollama on the H100 via SSH tunnel (`11434`).
- Only does shallow dataset discovery.

## Phase 1 — Rich dataset cards (DONE)
Deliver, per result:
- description, **size**, **format + example file**, **date of formation**
- **sources & citations** (CERN record URL + files)
- AI downstream-use suggestion
- how to download/use (`cernopendata-client`)
- Fix: separate real **datasets** from glossary/docs so "atom" no longer returns a 0-file glossary record.
- Uses the existing `GET /api/record/<id>` (already returns files/URIs).

## Phase 2 — RAG over CERN docs (DONE)
Answers questions like *"Why does CMS use a solenoid?"*.
- ✅ Corpus: curated `seed.json` + Documentation records fetched from CERN Open Data.
- ✅ Embeddings via `nomic-embed-text` on the H100; NumPy cosine vector store (`rag.py`, `build_index.py`).
- ✅ `POST /api/ask` → retrieve → **grounded answer with inline [n] citations + sources**.
- ✅ UI: "Ask about CERN" mode with grounded/not-grounded badge and source list.

## Phase 2.5 — Query router (DONE)
One box that auto-decides search vs ask — the first step toward the agent.
- ✅ `ollama_client.classify_intent()` → `{intent: search|ask, confidence}` with a keyword fallback if the model is down.
- ✅ `POST /api/assistant` classifies then dispatches to the shared search / ask logic; returns `mode` + `route_confidence`.
- ✅ UI: default **"Assistant (auto)"** tab — single console that renders dataset cards or a grounded answer based on the route (manual tabs kept).

## Phase 3 — Guardrails (grounding is judged) (DONE)
Three deterministic rails wrap the RAG flow (`guardrails.py`) plus an LLM fact-check pass:
- ✅ **Input rail** — block prompt-injection / unsafe / off-scope before any model call.
- ✅ **Retrieval rail** — "no CERN source → no answer": refuse if the best passage is below a similarity floor (`RAG_MIN_SCORE`), calibrated on the seed corpus (on-topic ~0.6-0.75 vs off-topic ~0.40).
- ✅ **Citation rail** — keep only citations that map to a retrieved passage relevant enough to cite (`RAG_MIN_CITE_SCORE`).
- ✅ **Grounding rail** — second-pass `verify_grounding` fact-check rejects answers with claims not supported by the cited passages (caught e.g. a hallucinated Hawking-radiation answer).
- ✅ Graceful refusals instead of hallucinating; every kept answer shows citations. Rail decision surfaced in the UI + `/api/health`.

## Phase 4 — Agentic (AIQ)
- Wrap router + tools (search, record fetch, RAG retrieve) as an agent that chains: interpret → search → fetch metadata → explain → cite.

## Phase 5 — Polish
- Cache CERN calls, stream answers, facet filters (experiment/energy/format), dataset preview/download.
- Deploy backend on the H100 (drop the laptop tunnel).
- Basic tests for `cern_client` / `ollama_client`.

## Build order (hackathon)
Judges reward grounding + the RAG/AIQ/Guardrails trio:
**Phase 1 → Phase 2 → Phase 3 → Phase 4**, Phase 5 if time remains.
