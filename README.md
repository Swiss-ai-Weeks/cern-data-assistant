# CERN Data Assistant (Beamline)

HPE & NVIDIA Agentic AI Hackathon — [Swiss-ai-Weeks/cern-data-assistant](https://github.com/Swiss-ai-Weeks/cern-data-assistant).

Natural-language search over [CERN Open Data](https://opendata.cern.ch/). You type something like *“I need proton-proton collisions at 13 TeV with muons”*. A model on the LaunchPad H100 turns that into search terms, the backend queries CERN, and the same model ranks the hits.

**Do not run the LLM on your laptop.** The GPUs are on NVIDIA LaunchPad. Your machine only runs the UI + Flask, and tunnels to Ollama on the H100.

```
Laptop                         LaunchPad H100
------                         --------------
http://127.0.0.1:5173  UI
http://127.0.0.1:5001  Flask  --SSH tunnel 11434-->  Ollama (llama3.2, 2× H100)
                                 CERN API is public (opendata.cern.ch)
```

If Ollama is down, search still works; ranking is off.

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

On **your** machine, leave this running:

```bash
ssh -N -L 11434:127.0.0.1:11434 launchpad-cern
```

`localhost:11434` is now the H100. If this dies, the UI shows **ollama offline**.

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
- **all 1,006 CERN Open Data glossary terms**

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

The model is never trusted to judge its own grounding. `guardrail.py` applies:

1. **Retrieval gate** — if the best passage's cosine similarity is below
   `RAG_MIN_SCORE` (0.65, calibrated: on-topic questions score ≥ 0.75, off-topic
   ≤ 0.58) the API refuses *before* calling the LLM. Between 0.65 and 0.70 it
   answers but flags **low confidence**.
2. **Citation check** — every `[n]` in the answer must point at a passage that was
   actually shown; invalid ones are stripped, and an answer with no valid citation
   is returned as `grounded: false`. The model may also reply `NOT_IN_SOURCES`,
   which becomes the same refusal.

Every response carries `guardrail: {status, top_score, threshold, citations_removed}`
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

Try:

- `I need proton-proton collisions at 13 TeV with muons`
- `ATLAS data about the Higgs boson`
- `muon detector data from CMS, 8 TeV`

Flow:

1. Ollama extracts CERN search keywords
2. Backend queries `https://opendata.cern.ch/api/records/`
3. Ollama ranks hits and writes a one-line *why*
4. UI shows experiment, type, energy, date, file count, abstract

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
│   ├── app.py              # /api/health  /api/search  /api/ask  /api/record/<id>
│   ├── cern_client.py      # CERN Open Data REST + rich card fields
│   ├── ollama_client.py    # query extract, ranking, embeddings, grounded answer
│   ├── rag.py              # tiny local vector store (NumPy cosine + boosts)
│   ├── guardrail.py        # retrieval gate + citation verification
│   ├── build_index.py      # build the RAG index: seed + CERN docs + glossary
│   ├── knowledge/
│   │   ├── seed.json       # curated authoritative CERN facts (+ sources)
│   │   ├── index.npy       # built embeddings (gitignored)
│   │   └── chunks.json     # built chunk texts (gitignored)
│   └── requirements.txt
├── frontend/
│   └── src/                # React + Vite UI (Beamline): Find datasets + Ask
└── dataset/                # optional local CERN JSON dumps (gitignored)
```

H100 scratch (not in git): `~/nvidia_hack/dataset/` (`fetch_cern.py`, `proton_full.json`, `tf` venv).

---

## API

**POST `/api/search`** — dataset discovery

```json
{ "query": "proton-proton collisions at 13 TeV with muons", "size": 8 }
```

**POST `/api/ask`** — grounded Q&A (RAG) with citations

```json
{ "query": "Why does CMS use a solenoid?" }
```

Returns `{ answer, grounded, sources[] }`; `grounded` is `false` when no CERN
source supports the question.

**GET `/api/record/<recid>`** — full metadata + files  
**GET `/api/health`** — CERN + Ollama + knowledge-base status

---

## Team notes

- Challenge next: dataset cards (size, format, how to use, citations), RAG over detector docs, NeMo Guardrails / AIQ.
- Model on the H100 is **qwen2.5:32b** (set via `OLLAMA_MODEL`); it falls back to **llama3.2** automatically if the bigger model is not pulled.
- Keep `backend/.env` and `frontend/.env` local (gitignored).
