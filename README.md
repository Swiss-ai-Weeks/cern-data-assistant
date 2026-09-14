# Beamline — natural-language search over CERN Open Data

A small full-stack app:

- **Frontend**: React + Vite + TypeScript
- **Backend**: Flask (Python)
- **LLM**: local [Ollama](https://ollama.com) model — no API keys, no cloud calls
- **Data source**: the public [CERN Open Data](https://opendata.cern.ch/) REST API

You type something like *"fetch me the best dataset on proton"*, the local
model turns that into good search keywords, the backend queries CERN Open
Data, and (if Ollama is running) the same model ranks and explains the
results before they're shown.

This is an MVP meant to be optimized later — see **Notes & next steps** at
the bottom.

---

## 1. Prerequisites (M1 Mac)

- **Python 3.10+** — check with `python3 --version`
- **Node.js 18+** — check with `node --version`
- **Ollama** for Apple Silicon:

  ```bash
  brew install ollama
  ```

  Then pull a small local model (any of these run comfortably on an M1):

  ```bash
  ollama pull llama3.2      # ~2GB, good default
  # or
  ollama pull qwen2.5:7b    # a bit larger, often better at following JSON format
  ```

  Start the Ollama server (leave this running in its own terminal tab):

  ```bash
  ollama serve
  ```

  Ollama listens on `http://localhost:11434` by default.

---

## 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env if you pulled a different model than llama3.2

python app.py
```

The API now runs at `http://localhost:5001`.

> **Why port 5001, not 5000?** On macOS, port 5000 is used by the AirPlay
> Receiver service by default, which silently breaks Flask's usual default
> port. 5001 avoids that entirely.

Sanity check:

```bash
curl http://localhost:5001/api/health
```

You should see `"cern_api": "ok"` and, once Ollama is running, `"ollama": "ok"`.

---

## 3. Frontend setup

In a second terminal tab:

```bash
cd frontend
npm install
cp .env.example .env   # points VITE_API_BASE at the backend
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

---

## 4. Using it

Type a request like:

- "fetch me the best dataset on proton"
- "ATLAS data about the Higgs boson"
- "muon detector data from CMS, 8 TeV"

The backend will:

1. Ask the local model to turn your sentence into CERN-style search
   keywords (e.g. "proton").
2. Query `https://opendata.cern.ch/api/records/` with those keywords.
3. Pull a pool of candidate records and ask the local model to rank them
   against your original request, with a one-line reason for each.
4. Return the top matches with metadata: experiment, type, collision
   energy, publish date, file count, and an abstract snippet.

If Ollama isn't running, the app still works — it just searches CERN Open
Data directly with your raw text and skips the ranking step (you'll see
`ranking: off` under the search box).

---

## 5. Project layout

```
cern-ai-search/
├── backend/
│   ├── app.py             # Flask routes: /api/search, /api/record/<id>, /api/health
│   ├── cern_client.py     # CERN Open Data REST API wrapper + response shaping
│   ├── ollama_client.py   # Local Ollama chat calls: query extraction + ranking
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── api.ts             # fetch() wrappers around the Flask API
    │   ├── types.ts
    │   └── components/
    │       ├── SearchConsole.tsx
    │       ├── ResultsFeed.tsx
    │       ├── ResultRow.tsx
    │       └── StatusBar.tsx
    ├── index.html
    └── .env.example
```

---

## 6. API reference

### `POST /api/search`

```json
{ "query": "fetch me the best dataset on proton", "size": 8 }
```

`size` is optional (default 8). Response:

```json
{
  "query": "fetch me the best dataset on proton",
  "search_terms": "proton",
  "total_matches": 1234,
  "returned": 8,
  "model_used": "llama3.2",
  "llm_ranked": true,
  "results": [
    {
      "recid": 80000,
      "title": "...",
      "experiment": "CMS",
      "type": "Dataset",
      "collision_energy": "7TeV",
      "date_published": "2014-01-15",
      "file_count": 42,
      "abstract": "...",
      "url": "https://opendata.cern.ch/record/80000",
      "relevance": 92,
      "why": "Directly matches proton-proton collision data from CMS."
    }
  ]
}
```

### `GET /api/record/<recid>`

Full metadata for one record, including a `files` list with download URIs.

### `GET /api/health`

Reports whether CERN Open Data and the local Ollama server are reachable,
and which models are installed.

---

## 7. Notes & next steps

This is deliberately an MVP to optimize later. Ideas, roughly in order of
value:

- **Caching**: cache CERN search responses (e.g. in SQLite or Redis) —
  identical queries currently hit the live API every time.
- **Streaming ranking**: stream the LLM's ranking output so results appear
  progressively instead of all at once.
- **Filters**: expose CERN's own facets (experiment, collision type, file
  format) as UI filters instead of relying entirely on free-text + LLM
  interpretation.
- **File-level search**: use `cernopendata-client` (or the `files` field
  already returned by `/api/record/<id>`) to let users preview or download
  specific files, not just whole records.
- **Better ranking model**: try `qwen2.5:7b` or `mistral` locally and
  compare relevance quality against `llama3.2`.
- **Tests**: none exist yet — `cern_client.py` and `ollama_client.py` are
  both small and pure enough to unit-test with mocked HTTP responses.
