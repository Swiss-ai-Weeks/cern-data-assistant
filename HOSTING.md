# Hosting Beamline (production)

Beamline ships as **one service**: Flask API + built React UI on a single port (default **5001**).

## Build & run

```bash
cd frontend && npm ci && npm run build
cd ../backend
export SERVE_FRONTEND=1
export PORT=5001
# configure .env (OLLAMA_HOST, OLLAMA_MODEL, RAG paths, etc.)
python app.py
# or: gunicorn -w 2 -b 0.0.0.0:5001 'app:app'
```

Requirements:

- Python 3.10+ with `backend/requirements.txt`
- Ollama reachable at `OLLAMA_HOST` with chat + embed models
- Knowledge index built (`backend/build_index.py` or deploy script)
- Outbound HTTPS to `opendata.cern.ch`

## Environment (minimum)

| Variable | Purpose |
|----------|---------|
| `SERVE_FRONTEND=1` | Serve `frontend/dist` from Flask |
| `PORT` | Listen port |
| `OLLAMA_HOST` | LLM + embeddings |
| `OLLAMA_MODEL` | Primary chat model |
| `RAG_MIN_SCORE` | Retrieval floor (default from guardrails) |

See `backend/.env.example` for the full list.

## Health check

`GET /api/health` — use for load balancers and uptime monitors.

The UI polls every 20s and shows a banner if catalog, model, or index is degraded.

## Reverse proxy

Terminate TLS at nginx/Caddy and proxy to `127.0.0.1:5001`. Enable WebSocket/SSE-friendly settings for `POST /api/agent/stream` (no buffering on the stream path).

## Session model

Investigations live **in the browser session** (in-memory). Refresh clears history. No login in v1.

## What users see

- **Help** (dock + footer) — product guide
- **Trust & safety** (`?`) — how refusals and citations work
- **Status strip** — catalog, model, index size

## Pre-launch checklist

- [ ] `npm run build` committed or built in CI
- [ ] `SERVE_FRONTEND=1` in production env
- [ ] Knowledge index present on server
- [ ] Ollama models pulled and warm
- [ ] CERN API reachable from host
- [ ] Smoke: one dataset query + one grounded question + health 200
