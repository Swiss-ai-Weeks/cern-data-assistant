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
Pull the embedding model on the H100 once, then build the index locally
(with the tunnel up):

```bash
# on the H100:
ollama pull nomic-embed-text

# on the laptop, in backend/ with the venv active + tunnel running:
python build_index.py --with-cern
```

This writes `knowledge/index.npy` + `knowledge/chunks.json` (gitignored).
Health should then show `"knowledge_base": "ready"`. Curated facts live in
`knowledge/seed.json` — add more there and rebuild.

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
2. Ollama extracts CERN search keywords; if CERN's AND-search returns 0 hits, terms are broadened
3. Backend queries `https://opendata.cern.ch/api/records/` (cached ~5 min)
4. Ollama ranks hits and writes a one-line *why*
5. Knowledge questions go through RAG + guardrails (no CERN source → no answer)
6. UI shows experiment, size, format, how to download, citations, plus facet filters

Manual **Find datasets** / **Ask about CERN** tabs are still there.

---

## Layout

```
cern-data-assistant/
├── backend/
│   ├── app.py              # /api/health /search /ask /assistant /agent /record/<id>
│   ├── cern_client.py      # CERN Open Data REST + rich card fields + cache
│   ├── ollama_client.py    # extract, rank, route, plan, embeddings, grounded answer
│   ├── rag.py              # tiny local vector store (NumPy cosine)
│   ├── guardrails.py       # input / retrieval / citation rails
│   ├── cache.py            # in-process TTL cache for CERN HTTP
│   ├── build_index.py      # build the RAG index from seed + CERN docs
│   ├── knowledge/
│   │   ├── seed.json       # curated authoritative CERN facts (+ sources)
│   │   ├── index.npy       # built embeddings (gitignored)
│   │   └── chunks.json     # built chunk texts (gitignored)
│   ├── tests/              # unittest (no network): rails, cache, flattening
│   └── requirements.txt
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
- Current model is **llama3.2** (3B) on H100 so ranking is fast. Bigger models can wait.
- Keep `backend/.env` and `frontend/.env` local (gitignored).
