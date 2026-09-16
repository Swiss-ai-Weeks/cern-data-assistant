# Beamline · CERN Data Assistant

**Ask a scientific question. See real CERN data behind the answer. Change the analysis. Export the evidence.**

Built for the HPE & NVIDIA Agentic AI Hackathon · [GitHub](https://github.com/Swiss-ai-Weeks/cern-data-assistant)

## Try it now

The release runs on NVIDIA LaunchPad. Open it through an SSH tunnel:

```bash
ssh -N -L 5001:127.0.0.1:5001 launchpad-cern
```

Then visit **http://127.0.0.1:5001**. For a temporary public URL during judging, run:

```bash
./scripts/keep_demo_alive.sh
```

(Quick-tunnel hostnames change on restart; publish only the URL printed by the running command.)

Judges / CI snapshot: `/api/investigations/product-summary` (phase, gates, eval set, investigation status)

### For hackathon judges

1. Open **Lab** → default spectrum runs on real staged CMS data (500k entries).
2. Change muon **pT** / **η** → **Run revised selection** (numbers are computed, not LLM-generated).  
3. Click the **30 GeV region** → inspect real entries and CERN evidence labels.  
4. **Export investigation** → ZIP with recipe, checksums, claims, notebook.  
5. Try **13 TeV** in search → constraint banner explains catalog vs runnable 8 TeV adapter.

Full walkthrough: [DEMO.md](DEMO.md). Automated rehearsal: `./scripts/judge_demo.sh`.

CI: GitHub Actions **test** workflow on `main` (177 pytest + product gates).

## What it does

1. **Find data** — Search [CERN Open Data](https://opendata.cern.ch/) in plain English. Energy and experiment constraints stay visible; we do not silently switch datasets.
2. **Ask with sources** — Detector and documentation questions are answered only when a CERN passage supports them; otherwise Beamline refuses.
3. **Investigate** — Run a real **CMS dimuon mass spectrum** on a bounded, checksum-verified sample: change muon selections, compare runs, inspect bins, read evidence labels, and **export a reproducible ZIP**.

## Example questions

| Goal | Try |
| --- | --- |
| Catalog | `I need proton-proton collisions at 13 TeV with muons` |
| Documentation | `Why does CMS use a solenoid?` |
| Investigation | `Show me the CMS dimuon mass spectrum and help me understand its peaks` |

Open the **Investigate** tab for the spectrum workspace. Use **Find data / Ask** for search and grounded Q&A.

## How it is built (short)

- **Frontend:** React (Vite)  
- **Backend:** Flask — search, RAG Q&A, agent routing, investigation API  
- **LLM:** Ollama on NVIDIA LaunchPad (e.g. `qwen2.5:32b`)  
- **Numbers in plots:** Deterministic Python on staged CERN data — not invented by the model  

More product detail: [HACKATHON_PLAN.md](HACKATHON_PLAN.md)

## Run on the GPU server (recommended for demos)

SSH to LaunchPad, then:

```bash
git clone https://github.com/Swiss-ai-Weeks/cern-data-assistant.git
cd cern-data-assistant
tmux new -s app
./scripts/start_h100.sh
```

From your laptop, tunnel port 5001:

```bash
ssh -N -L 5001:127.0.0.1:5001 launchpad-cern
```

Open http://localhost:5001

After `git pull`, restart the server:

```bash
PUBLIC_DEMO_URL=https://your-demo.trycloudflare.com ./scripts/restart_app.sh --background
```

**Real investigation data:** once on the server, prepare the bounded sample (large download):

```bash
cd backend && source .venv/bin/activate
pip install -r analysis/requirements.txt
python -m analysis.prepare --entries 500000
```

## Run locally (developers)

**Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python build_index.py    # first time: RAG index for Ask
python app.py
```

**Frontend** (separate terminal)

```bash
cd frontend
cp .env.example .env
npm install --legacy-peer-deps
npm run dev
```

Open http://127.0.0.1:5173 — API defaults to http://127.0.0.1:5001

**Tests before you ship**

```bash
./scripts/ship.sh
```

## License

MIT — see [LICENSE](LICENSE).
