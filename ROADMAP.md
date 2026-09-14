# CERN Data Assistant — Roadmap

Goal: turn Beamline (natural-language dataset search) into the full **CERN Data Assistant** the challenge asks for — grounded answers about **datasets** *and* **detectors/experiments**, using **RAG + AIQ + Guardrails**.

## Phase 0 — Wiring (DONE)
- NL query → `llama3.2` on the LaunchPad H100 extracts search terms.
- CERN Open Data search → LLM ranks hits with a one-line reason.
- Flask API (`5001`) + React UI (`5173`) on the laptop; Ollama on the H100 via SSH tunnel (`11434`).
- Only does shallow dataset discovery.

## Phase 1 — Rich dataset cards (NEXT)
Deliver, per result:
- description, **size**, **format + example file**, **date of formation**
- **sources & citations** (CERN record URL + files)
- AI downstream-use suggestion
- how to download/use (`cernopendata-client`)
- Fix: separate real **datasets** from glossary/docs so "atom" no longer returns a 0-file glossary record.
- Uses the existing `GET /api/record/<id>` (already returns files/URIs).

## Phase 2 — RAG over CERN docs (core differentiator)
Answers questions like *"Why does CMS use a solenoid?"*.
- Ingest CERN Open Data + detector/experiment docs → chunk → embed on H100 → vector store (Chroma/FAISS).
- `POST /api/ask` → retrieve → answer **with inline CERN citations**.
- Query router: "find datasets" → search path; "explain/why/how" → RAG path.

## Phase 3 — Guardrails (grounding is judged)
- NeMo Guardrails / validation layer: no physics claim without a retrieved CERN source.
- Graceful "no CERN source for that" instead of hallucinating.
- Every answer shows citations.

## Phase 4 — Agentic (AIQ)
- Wrap router + tools (search, record fetch, RAG retrieve) as an agent that chains: interpret → search → fetch metadata → explain → cite.

## Phase 5 — Polish
- Cache CERN calls, stream answers, facet filters (experiment/energy/format), dataset preview/download.
- Deploy backend on the H100 (drop the laptop tunnel).
- Basic tests for `cern_client` / `ollama_client`.

## Build order (hackathon)
Judges reward grounding + the RAG/AIQ/Guardrails trio:
**Phase 1 → Phase 2 → Phase 3 → Phase 4**, Phase 5 if time remains.
