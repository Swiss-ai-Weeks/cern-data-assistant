# Beamline — what this app is, A to Z

**Name:** Beamline (CERN Data Assistant)  
**Repo:** [Swiss-ai-Weeks/cern-data-assistant](https://github.com/Swiss-ai-Weeks/cern-data-assistant)  
**Event:** HPE & NVIDIA Agentic AI hackathon, Swiss AI Weeks  
**URL for the pitch:** http://127.0.0.1:5001 (laptop SSH tunnel into the LaunchPad H100)

One sentence: **English in, a real CERN Open Data record or a sourced detector answer out — and if CERN did not write it, Beamline will not say it.**

ChatGPT can lecture. Beamline can hand you **recid, files, DOI, and `cernopendata-client download-files --recid N`** from a live hit on [opendata.cern.ch](https://opendata.cern.ch), or show the paragraph the GPU wanted to write and the rail that blocked it.

---

## A — Audience and challenge

Judges want **natural-language CERN Open Data search** plus **grounded Q&A about experiments and detectors**. Suggested stack: **RAG + Guardrails + an agent (AIQ-style)**.

We did not install NVIDIA AIQ or NeMo Guardrails. Same ideas, our code. Fine unless someone asks for the branded packages.

Example queries from the brief:

- *proton-proton collisions at 13 TeV with muons*
- *Why does CMS use a solenoid?*

Grounding is judged. Inventing physics is a fail.

---

## B — What you see when it opens

A **centered chat home** (paper `#ECEDE8`, ink, cobalt serif accents):

1. **Status strip** — Catalog online/offline · model name · source count  
2. **Hero** — “Find the evidence, not just an answer.”  
3. **Search bar** (sticky while you scroll results)  
4. **Three demo beats** — Find 13 TeV muons · CMS solenoid · GPU lying demo  
5. Example query chips  
6. **Bottom dock** — Home · New · Datasets · Search · History  

After you ask:

- **You asked** — your question + plan/tools chips  
- **Live progress** — one compact card while the agent runs  
- **One of three outcomes** on the same column:  
  - **Dataset handoff** (recid, metadata, download, portal)  
  - **Grounded answer** (citations + receipt)  
  - **Integrity rail** (draft vs refusal)  
- **Other catalog matches** and **suggested follow-ups** on the main page  

History drawer and Datasets tab are secondary; the pitch lives on **Investigate**.

---

## C — What it is not

- Not ChatGPT with a CERN theme.
- Not a three-tab prototype (old Search / Ask / Agent panels still exist in the codebase; the live product is the stage).
- Not ROOT / event-display of a real `.root` file. The collision canvas is a **visual**, not reconstructed tracks from a dataset.
- Not persistent user accounts or saved sessions (`backend/store.py` is unused).
- Not token streaming of the 32B answer (answers arrive as a block; tool steps stream).

---

## D — Demo (what you say)

Script: [DEMO.md](DEMO.md). Rehearse: `./scripts/judge_demo.sh`.

**Do not say** RAG, guardrails, agent. Say the objects.

1. Collision → Fire 13 TeV muons → *this HTTP hit opendata.cern.ch. ChatGPT cannot invent this recid.* Copy the command. Export the notebook.
2. Show the GPU lying → *same GPU, no CERN passage above the floor, so the lecture is not the product.*
3. Optional: *Why does CMS use a solenoid?* — every `[n]` is a portal page; point at the **grounding receipt**.
4. Backup combo: *find CMS muon datasets and explain why CMS uses a solenoid* — ticket + cited answer in one turn.

---

## E — End-to-end flow

```
English
  → planner (qwen 32B): search_query and/or ask_query
  → SEARCH: facets + keywords → CERN REST API → optional broaden/retry
            → LLM rank → fetch top record files
            → boarding pass + tiles
  → ASK: embed question → cosine vs local index
            → below 0.70: refuse, no 32B; llama3.2 drafts the “temptation”
            → above floor: 32B answers only from passages, [n] citations
            → strip bad citations / uncited sentences
            → fact-check at temperature 0
            → receipt (model, score, floor, CERN URLs)
```

Live UI uses **SSE** `POST /api/agent/stream`: Plan → Search → Ground → Fetch. Datasets can appear as soon as search returns, before the answer finishes.

---

## F — Frontend (what ships)

React + Vite, Folio design (General Sans, Instrument Serif italic, IBM Plex Mono).

| Piece | File | Job |
|---|---|---|
| Shell | `frontend/src/App.tsx` | Health poll, rail, wordmark |
| Chat / layout | `Chat.tsx` | Thread, SSE, follow-ups, hide thread until first ask |
| Stage | `Workbench.tsx` | Idle collision + punches; live pipe; pass; answer |
| Collision | `CollisionView.tsx` | Canvas event display |
| Ticket | `BoardingPass.tsx` | Recid, DOI, copy `cernopendata-client`, notebook |
| Notebook | `frontend/src/lib/notebook.ts` | Client-side `.ipynb` download |
| Answer | `AnswerCard.tsx` | Citations, receipt, or ungrounded vs rail split |
| Tiles | `DatasetTile.tsx` | Other hits |
| Drawer | `RecordDrawer.tsx` | Full record + file list |
| Status | `StatusBar.tsx` | CERN / GPU / chunk count |

Built UI: `frontend/dist`, served by gunicorn when `SERVE_FRONTEND=1`.

---

## G — Guardrails (why it is not ChatGPT)

Order, in `backend/guardrails.py` + `app.py`:

1. **Input** — injection / unsafe → stop. No ungrounded draft (we will not generate a bomb lecture).
2. **Retrieval floor** — best cosine **&lt; 0.70** → no qwen call. Message: no authoritative CERN source. Rail `retrieval:no_source`.
3. **Low-confidence band** 0.70–0.75 — answer only with citations; uncited sentences dropped; at least one cited passage must itself clear the floor or refuse (`grounding:low_confidence`).
4. **Citation rail** — `[n]` must be a retrieved passage above cite score (~0.45). Else strip or refuse `citation:none`.
5. **Fact-check** — second LLM pass, temperature 0. Lexical arbiter vetoes false “unsupported” flags when the claim is a paraphrase of the passage.

**No CERN source → no physics.** That is the judged property.

On a physics refusal, **llama3.2** (no RAG) writes `ungrounded_draft` so judges *see* the rail, not a polite content filter.

---

## H — How search works

`backend/cern_client.py` + `_run_search` in `app.py`.

1. NL → short keywords (`extract_query`).
2. **Facets sent to CERN** (not filter-after-fetch): experiment, collision energy, collision type, `type=Dataset`. Example: “proton-proton collisions at 13 TeV with muons” → energy 13 TeV, pp, keywords like `muons`.
3. CMS aliases (muons → DoubleMuon / SingleMuon, etc.).
4. If empty: **keyword broaden** (drop TeV) then **facet ladder** (loosen filters).
5. Pool of hits, **LLM rank** for the user’s sentence, datasets before docs.
6. Cards: size, formats, DOI, citation, `cernopendata-client` command, energy, run period.
7. Agent tool **fetch_record**: GET the top dataset; stitch files + license onto the ticket.

CERN HTTP cached ~300s (`CERN_CACHE_TTL`).

---

## I — Index / RAG

Built by `backend/build_index.py` (gitignored `index.npy` / `chunks.json`; rebuild on the H100).

~**1636–1639 chunks**:

- `knowledge/seed.json` — curated demo facts (CMS solenoid, ATLAS magnet, MiniAOD vs NanoAOD, Run 2 / 13 TeV, pile-up, ALICE TPC, LHCb spectrometer, …) with source URLs
- CERN **documentation** records (stripping pages skipped)
- CERN **glossary** (~1000 terms)

Embeddings: **nomic-embed-text** with `search_document:` / `search_query:` prefixes. Retrieval: NumPy cosine in `rag.py`. Default **k = 6** passages.

---

## J — Models (H100 only)

**Do not run the LLM on the laptop.**

| Model | Role |
|---|---|
| **qwen2.5:32b** | Planner, ranker, grounded answer, fact-check |
| **llama3.2** | Fallback if 32B missing; **ungrounded draft** on refuse |
| **nomic-embed-text** | RAG embeddings |

Ollama on the GPU box `:11434`, `keep_alive=-1`. Warm: `scripts/warm_h100.sh`.

---

## K — API

| Method | Path | What |
|---|---|---|
| GET | `/api/health` | CERN, Ollama, model, chunks, floors, cache |
| POST | `/api/search` | Ranked CERN records |
| POST | `/api/ask` | Grounded Q&A + rails + optional draft |
| POST | `/api/assistant` | Auto route search vs ask |
| POST | `/api/agent` | Plan + search and/or ask + fetch |
| POST | `/api/agent/stream` | Same, SSE (`status`, `plan`, `tool_done`, `result`) |
| GET | `/api/record/<recid>` | Full record + files |

The UI only needs **agent/stream**. The rest is for rehearsal and debugging.

---

## L — Laptop vs GPU

**Pitch (one port):**

```
Laptop  http://127.0.0.1:5001  --SSH 5001-->  H100 gunicorn (UI + Flask)
                                          Ollama 32B + embed
                                          CERN API public
```

Tunnel:

```bash
ssh -N -L 5001:127.0.0.1:5001 launchpad-cern
```

On the box, tmux session `app`: `scripts/start_h100.sh` (Ollama, venv, index if missing, `npm run build`, gunicorn `:5001`). `--rebuild` rebuilds the index and UI.

**Dev:** Vite `:5173` + local Flask `:5001`, Ollama tunneled `:11434`. Search still works if Ollama is down; ranking and Ask are off.

LaunchPad (current lab): `ssh -p 15406 nvidia@global.prd.ga.launchpad.nvidia.com` (host alias `launchpad-cern`). 2× H100 NVL.

---

## M — Machine layout (backend)

| File | Job |
|---|---|
| `app.py` | Flask, agent, SSE, refusals + draft |
| `cern_client.py` | Portal API, facets, summarize, usage command |
| `ollama_client.py` | extract, classify, plan, rank, answer, verify, draft |
| `rag.py` | Load numpy index, cosine search |
| `guardrails.py` | Input / floor / citations / cite-or-drop / arbiter |
| `cache.py` | TTL cache for CERN HTTP |
| `build_index.py` | Build the knowledge base |

Tests: `cd backend && python -m unittest discover -s tests -v` (no network). Facets, broadening, cache, CERN summarizers, rails, ollama mocks, draft-allowed.

---

## N — Notebook export

Browser-only. Markdown cell: title, recid, experiment, portal, DOI. Code cell: `cernopendata-client` command. File name `beamline-recid-N.ipynb`. Judges walk away with a file ChatGPT cannot mint from a live catalog row.

---

## O — Objects on the stage (pitch vocabulary)

- **Collision** — you are not in a chatbot.
- **Boarding pass** — live CERN record (ticket).
- **Copy download** — the exact client command.
- **Notebook** — take-home artifact.
- **The rail** — left: GPU temptation; right: Beamline.
- **Receipt** — model, best match / floor 0.70, cited CERN URLs.

---

## P — Pitch line

*ChatGPT will invent a CMS muon dataset. Beamline will give you the record, the files, and the download. Then we ask about black holes and show the lecture the GPU wanted to give — with the CERN rail stamped across it.*

---

## Q — Quality bar (calibrated)

On the ~1636-chunk index with nomic-embed-text:

- 15 on-topic demo questions: top score **≥ ~0.756**
- 10 off-topic (black holes, pasta, World Cup, …): **≤ ~0.660**
- Floor **0.70**, low-confidence to **0.75**

If a demo refusal comes back grounded, the index or floor drifted — check health `guardrails.min_top_score`.

---

## R — Runbook if something dies

| Symptom | Fix |
|---|---|
| UI old / no collision | Hard refresh `Ctrl+Shift+R` |
| Blank page | Tunnel: `ssh -N -L 5001:127.0.0.1:5001 launchpad-cern` |
| `ollama offline` / first token forever | On H100: `tmux attach -t app`, `scripts/start_h100.sh`, `scripts/warm_h100.sh` |
| Empty knowledge | `scripts/start_h100.sh --rebuild` |
| Draft column empty | llama3.2 not pulled; refusal still works |
| After git pull, old UI | On H100: `git pull`, `cd frontend && npm run build`, `kill -HUP` gunicorn master |

---

## S — Stack

- React 19 / Vite 8 frontend
- Flask + gunicorn (2 workers, 300s timeout) backend
- Ollama on LaunchPad
- CERN Open Data REST `https://opendata.cern.ch/api/records/`
- NumPy RAG (no vector DB)

---

## T — Tools the agent actually has

1. **search** — CERN Open Data
2. **ask** — grounded RAG
3. **fetch_record** — top hit files

Planner may use one, the other, or both. Empty search retries with a broader query.

Follow-up **history** (last turns) is sent so “and the ATLAS one?” can stay in context. Suggested **follow-up chips** after a result. Not a long-term memory store.

---

## U — UX copy you should not say

Avoid: mission control, beam in flight, RAG, embeddings, AIQ, NeMo, “we implemented guardrails.”

Use: collision, ticket, recid, portal, download, notebook, rail, receipt, *ChatGPT cannot search this.*

---

## V — Versions / env that matter

See `backend/.env.example`. On the H100 typically:

- `OLLAMA_MODEL=qwen2.5:32b`
- `OLLAMA_FALLBACK_MODEL=llama3.2`
- `RAG_MIN_SCORE=0.70`
- `SERVE_FRONTEND=1`
- `FLASK_DEBUG=0`
- `PORT=5001`

Never commit `.env`.

---

## W — What is done vs leftover

**Done:** search, facets, RAG, rails, agent + stream, fetch, retry, H100 serve, Folio UI, collision idle, boarding pass, notebook, ungrounded draft, receipt, unit tests, demo script.

**Not done (on purpose):** NVIDIA AIQ package, NeMo Guardrails, token streaming, detector SVG cutaway, ChatGPT API side-by-side, logged-in sessions.

---

## X — Extra files in the repo

- `fetch_cern.py` / `search_within.py` / root `app.py` — earlier experiments, not the product path.
- `frontend/src/components/SearchConsole.tsx`, `AskPanel.tsx`, `AssistantPanel.tsx`, `ResultsFeed.tsx` — old consoles; unused by the cockpit.
- `backend/store.py` — not wired.

Product path: **H100 gunicorn → `frontend/dist` + `backend/app.py` → `/api/agent/stream`.**

---

## Y — You (team)

Local clone: `/home/lorik/Work/CERN/cern-data-assistant`. Teammates push `main`. After pull on the H100, rebuild the frontend and HUP gunicorn so Python + UI both reload.

---

## Z — One screen, one story

Open the URL. Collision. Two buttons.

First button: **a real CERN ticket** you can download tonight.  
Second button: **the GPU’s lie**, stamped.

That is the whole product.
