# CERN Data Assistant (Beamline)

HPE & NVIDIA Agentic AI Hackathon — [Swiss-ai-Weeks/cern-data-assistant](https://github.com/Swiss-ai-Weeks/cern-data-assistant).

Natural-language search over [CERN Open Data](https://opendata.cern.ch/). Type *“I need proton-proton collisions at 13 TeV with muons”* or *“Why does CMS use a solenoid?”*. A model on the LaunchPad H100 plans the request, searches CERN, and answers detector questions **only** when a CERN source supports them.

**Do not run the LLM on your laptop.** The GPUs are on NVIDIA LaunchPad.

### Demo (preferred)

One process on the H100 serves UI + API. Laptop only tunnels port **5001**.

```
Laptop                              LaunchPad H100 (2× H100)
------                              ------------------------
http://127.0.0.1:5001  <---SSH 5001---  gunicorn :5001  (React + Flask)
                                        Ollama :11434   (qwen2.5:32b, nomic-embed-text)
                                        CERN API is public (opendata.cern.ch)
```

Pitch script: [DEMO.md](DEMO.md) (four queries). On the GPU box: `scripts/start_h100.sh` then `scripts/warm_h100.sh`.

### Dev from a laptop

UI and Flask stay local; only Ollama is remote.

```
Laptop                              LaunchPad H100
------                              --------------
http://127.0.0.1:5173  UI
http://127.0.0.1:5001  Flask  --SSH tunnel 11434-->  Ollama (qwen2.5:32b, fallback llama3.2)
```

If Ollama is down, search still works; ranking and Ask are off.

---

## What you need

- Python 3.10+
- Node.js 18+
- SSH access to the team LaunchPad GPU (invite + **your public SSH key** in the LaunchPad UI)
- This repo

LaunchPad SSH (current lab):

```bash
ssh -p 15406 nvidia@global.prd.ga.launchpad.nvidia.com
```

Optional `~/.ssh/config`:

```
Host launchpad-cern
  HostName global.prd.ga.launchpad.nvidia.com
  User nvidia
  Port 15406
  IdentityFile ~/.ssh/id_rsa
  IdentitiesOnly yes
  ServerAliveInterval 30
```

Then: `ssh launchpad-cern`.

---

## 1. Clone

```bash
git clone https://github.com/Swiss-ai-Weeks/cern-data-assistant.git
cd cern-data-assistant
git pull
```

---

## 2. Ollama on the H100 (once per lab)

SSH to LaunchPad. Binary is already at `/usr/local/bin/ollama`. There is no systemd unit — start it in the background:

```bash
ssh launchpad-cern
# on the GPU node:
nohup ollama serve >/tmp/ollama.log 2>&1 &
ollama pull llama3.2
ollama list
```

Confirm it sees the GPUs in `/tmp/ollama.log` (`NVIDIA H100 NVL`). Ollama listens on **127.0.0.1:11434** on the GPU box only.

---

## 3. Tunnel (every time you work from a laptop)

**Demo (H100 serves UI+API):**

```bash
ssh -N -L 5001:127.0.0.1:5001 launchpad-cern
```

Open http://127.0.0.1:5001 — nothing else to start locally. See [DEMO.md](DEMO.md).

**Dev (Flask+Vite on the laptop, Ollama on the H100):**

```bash
ssh -N -L 11434:127.0.0.1:11434 launchpad-cern
```

`localhost:11434` is now the H100. If this dies, the UI shows **ollama offline**. Do not bind both tunnels to local **5001** at once — stop the laptop Flask first if you switch to the demo tunnel.
---

## 4. Backend (laptop)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # OLLAMA_HOST=http://localhost:11434  MODEL=llama3.2  PORT=5001
python app.py
```

API: http://127.0.0.1:5001

```bash
curl http://127.0.0.1:5001/api/health
```

You want `"cern_api": "ok"` and `"ollama": "ok"`. Port **5001** (not 5000) so macOS AirPlay does not steal it.

### 4b. Build the RAG knowledge base (for "Ask about CERN")

The **Ask** mode answers detector/experiment questions grounded in CERN sources.
The corpus is real CERN Open Data content, cached locally on first build:

- `knowledge/seed.json` — a few curated facts with source URLs
- **78 CERN Open Data "Documentation" records** with page text (About CMS, detector and
  data-format guides, trigger, pile-up, ALICE/ATLAS/LHCb/OPERA/DELPHI/JADE docs).
  The ~9,000 auto-generated LHCb "Stripping" pages are skipped.
- **the CERN Open Data glossary** (121 physics/data terms; the ~885 LHCb LoKi functor
  reference pages the portal also files as "glossary" are skipped: they are code stubs,
  not definitions, and they outranked the real entries)

```bash
# on the H100 (once):
ollama pull nomic-embed-text

# on the laptop, in backend/ with the venv active + tunnel running:
python build_index.py            # ~2 min: downloads + embeds ≈1,600 chunks
python build_index.py --force    # re-download the CERN records
python build_index.py --seed-only
```

This writes `knowledge/index.npy` + `knowledge/chunks.json` (gitignored); raw
API pulls are cached in `knowledge/raw_*.jsonl`. Health then shows
`"knowledge_base": "ready"` and the chunk count.

### 4c. Guardrails (how "grounded" is decided)

The model is never trusted to judge its own grounding. `guardrails.py` applies:

1. **Retrieval gate** — if the best passage's cosine similarity is below
   `RAG_MIN_SCORE` (0.70, calibrated on the 754-chunk index: 15 on-topic demo
   questions score ≥ 0.756, 10 off-topic ones ≤ 0.660) the API refuses *before*
   calling the LLM. Between 0.70 and 0.75 it answers but flags **low confidence**,
   and in that band every sentence must carry a citation: uncited sentences are
   dropped server-side (`sentences_removed` in `guardrail_detail`), and if nothing
   cited survives the answer is refused.
2. **Citation check** — every `[n]` in the answer must point at a passage that was
   actually shown and scored at least `RAG_MIN_CITE_SCORE`; invalid ones are stripped,
   and an answer with no valid citation is refused. The model may also reply
   `NOT_IN_SOURCES`, which becomes the same refusal.
3. **Fact-check pass** — a second LLM call (temperature 0, so the verdict is
   reproducible) checks every claim in the answer against the cited passages only;
   unsupported claims block the answer. A lexical arbiter vetoes verifier false
   positives: a flagged claim whose content words all occur in the cited passages
   (`RAG_LEXICAL_SUPPORT`, default 0.8) is a paraphrase, not new physics, and is
   kept (`verifier_overridden` in `guardrail_detail`).
4. **Input rail** — prompt-injection and unsafe requests are refused before any model call.
5. **Glossary-graph expansion** (only when the gate would refuse) — the glossary terms
   form a small graph: the portal's "See also" links plus nearest neighbours among the
   glossary embeddings. The small model names the vocabulary a question is about
   ("What is an atom made of?" → atom, nucleus, proton, electron…), only the names that
   exist in the CERN glossary survive, their one-hop neighbours are added, and retrieval
   is retried once with `question (proton, electron, ion, …)`. That lifts the atom
   question from 0.667 to 0.80 and it is answered from the Electron/Hadron/Ion entries,
   while black holes, reactors or the World Cup stay refused (their vocabulary is not in
   the glossary, or the retry is still under the floor). A rescued answer is always held to
   the low-confidence rails above; `expanded_terms` / `expansion_tried` in
   `guardrail_detail` show what happened. `RAG_EXPAND=0` turns it off.

Every response carries `guardrail` (the rail that decided, e.g. `grounded`,
`retrieval:no_source`, `grounding:unsupported`) plus `guardrail_detail: {status, top_score, threshold, citations_removed, unsupported}`
and `sources[]` with `used: true` on the passages the answer cites. Try
`"Who won the 2022 World Cup?"` to see the refusal.

---

## 5. Frontend (laptop)

```bash
cd frontend
cp .env.example .env        # VITE_API_BASE=http://localhost:5001
npm install --legacy-peer-deps
npm run dev -- --host 127.0.0.1 --port 5173
```

`--legacy-peer-deps` is required: Vite 8 vs `@vitejs/plugin-react` 4. Open http://127.0.0.1:5173/

Do **not** commit `node_modules`. If you cloned a copy that still has them, delete them and `npm install --legacy-peer-deps` on your OS.

---

## Using it

The default **Assistant (agent)** tab plans the request and can search datasets,
answer a detector question, or do both in one turn.

Try:

- `I need proton-proton collisions at 13 TeV with muons`
- `Why does CMS use a solenoid?`
- `find CMS muon datasets and explain why CMS uses a solenoid`
- `ATLAS data about the Higgs boson`

Flow:

1. The agent plans: dataset search, grounded Q&A, or both
2. Ollama extracts CERN search keywords. Exact filters are pulled out of the request
   deterministically and sent to CERN as **facets** (`collision_energy=13TeV`,
   `collision_type=pp`, `experiment=CMS`, `type=Dataset`), so "13 TeV" no longer has
   to appear as a keyword; the keyword query keeps only the physics terms. Physics
   keywords are also expanded to CMS primary-dataset names ("muons" → `DoubleMuon`,
   `SingleMuon`), which a keyword search would never match.
3. Backend queries `https://opendata.cern.ch/api/records/` (cached ~5 min). If the
   AND-search returns 0 hits the keywords are broadened first, then the facets are
   loosened one at a time (collision type → energy → experiment → none).
4. The pool is pre-ordered (collision data before simulated unless you asked for
   simulation, keyword in title, readable titles), then Ollama ranks it and writes a
   one-line *why*. The header shows the filters that were actually sent.
5. Knowledge questions go through RAG + guardrails (no CERN source → no answer)
6. UI shows experiment, size, format, how to download, citations, plus facet filters

Manual **Find datasets** / **Ask about CERN** tabs are still there.

---

## Run the full stack on the H100 (demo setup)

One process on the GPU box serves the built UI **and** the API on port 5001;
teammates only need one SSH tunnel and no local Python/Node.

```bash
ssh launchpad-cern
git clone https://github.com/Swiss-ai-Weeks/cern-data-assistant.git ~/cern-data-assistant   # once
cd ~/cern-data-assistant && git pull
tmux new -s app            # survives SSH drops; reattach with: tmux attach -t app
scripts/start_h100.sh      # starts Ollama if needed, pulls models, builds index + UI, warms the LLM, serves :5001
```

`start_h100.sh --rebuild` also rebuilds the RAG index and the UI bundle after a `git pull`.
The script writes `backend/.env` with `OLLAMA_MODEL=qwen2.5:32b`, `SERVE_FRONTEND=1`, `FLASK_DEBUG=0`.
Before a pitch, warm the 32B model so the first question is not a GPU cold-start:

```bash
scripts/warm_h100.sh
```

Judge queries (spoken + API): [DEMO.md](DEMO.md) · `./scripts/judge_demo.sh`

From your laptop:

```bash
ssh -N -L 5001:127.0.0.1:5001 launchpad-cern
open http://localhost:5001
curl -s localhost:5001/api/health | jq .
curl -s localhost:5001/api/ask -H 'content-type: application/json' -d '{"query":"Why does CMS use a solenoid?"}' | jq .
```

If Ollama dies: `pkill ollama; nohup env OLLAMA_KEEP_ALIVE=-1 ollama serve > ~/ollama.log 2>&1 &` then rerun the script.

---

## Layout

```
cern-data-assistant/
├── backend/
│   ├── app.py              # /api/health /search /ask /assistant /agent /record/<id>
│   ├── cern_client.py      # CERN Open Data REST + rich card fields + cache
│   ├── ollama_client.py    # extract, rank, route, plan, embeddings, grounded answer, fact-check
│   ├── rag.py              # tiny local vector store (NumPy cosine + glossary/experiment boosts)
│   ├── guardrails.py       # input rail, retrieval gate, citation rewrite, fact-check
│   ├── cache.py            # in-process TTL cache for CERN HTTP
│   ├── build_index.py      # build the RAG index: seed + CERN docs + glossary
│   ├── knowledge/
│   │   ├── seed.json       # curated authoritative CERN facts (+ sources)
│   │   ├── index.npy       # built embeddings (gitignored)
│   │   └── chunks.json     # built chunk texts (gitignored)
│   ├── tests/              # unittest (no network): rails, cache, flattening
│   └── requirements.txt
├── scripts/
│   ├── start_h100.sh       # one-box demo on the GPU node
│   ├── warm_h100.sh        # keep 32B + embed model loaded
│   └── judge_demo.sh       # four pitch queries against /api/agent
├── DEMO.md                 # spoken judge script
├── ROADMAP.md              # what's left
├── frontend/
│   └── src/                # React + Vite UI (Beamline)
└── dataset/                # optional local CERN JSON dumps (gitignored)
```

H100 scratch (not in git): `~/nvidia_hack/dataset/` (`fetch_cern.py`, `proton_full.json`, `tf` venv).

---

## API

**POST `/api/search`** — dataset discovery

```json
{ "query": "proton-proton collisions at 13 TeV with muons", "size": 8 }
```

**POST `/api/ask`** — grounded Q&A (RAG) with citations + guardrails

```json
{ "query": "Why does CMS use a solenoid?" }
```

Returns `{ answer, grounded, guardrail, sources[] }`; `grounded` is `false` when
no CERN source supports the question.

**POST `/api/assistant`** — auto-route one query to search or ask  
**POST `/api/agent`** — plan-and-execute; can run search **and** ask in one turn

```json
{ "query": "find CMS muon datasets and explain why CMS uses a solenoid" }
```

Returns `{ goal, tools_used, search, answer }`.

**GET `/api/record/<recid>`** — full metadata + files  
**GET `/api/health`** — CERN + Ollama + knowledge-base + cache stats

Run backend tests (no network, no GPU):

```bash
cd backend && python -m unittest discover -s tests -v
```

---

## Team notes

- RAG + Guardrails + AIQ agent are in; polish is cache, facets, and tests.
- Model on the H100 is **qwen2.5:32b** (set via `OLLAMA_MODEL`); it falls back to **llama3.2** automatically if the bigger model is not pulled.
- Keep `backend/.env` and `frontend/.env` local (gitignored).
