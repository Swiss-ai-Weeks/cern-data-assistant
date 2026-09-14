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

## Layout

```
cern-data-assistant/
├── backend/
│   ├── app.py              # GET /api/health  POST /api/search  GET /api/record/<id>
│   ├── cern_client.py      # CERN Open Data REST
│   ├── ollama_client.py    # query extract + ranking
│   └── requirements.txt
├── frontend/
│   └── src/                # React + Vite UI (Beamline)
└── dataset/                # optional local CERN JSON dumps (gitignored)
```

H100 scratch (not in git): `~/nvidia_hack/dataset/` (`fetch_cern.py`, `proton_full.json`, `tf` venv).

---

## API

**POST `/api/search`**

```json
{ "query": "proton-proton collisions at 13 TeV with muons", "size": 8 }
```

**GET `/api/record/<recid>`** — full metadata + files  
**GET `/api/health`** — CERN + Ollama status

---

## Team notes

- Challenge next: dataset cards (size, format, how to use, citations), RAG over detector docs, NeMo Guardrails / AIQ.
- Current model is **llama3.2** (3B) on H100 so ranking is fast. Bigger models can wait.
- Keep `backend/.env` and `frontend/.env` local (gitignored).
