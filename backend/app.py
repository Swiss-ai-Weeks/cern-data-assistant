"""
app.py — Flask backend for the CERN Open Data AI search app.

Endpoints:
  GET  /api/health            -> status of CERN API + local Ollama
  POST /api/search            -> { query, size?, use_llm_rank? } -> ranked results
  GET  /api/record/<recid>    -> full metadata + file list for one record

Run with:
    python app.py
(reads PORT / OLLAMA_HOST / OLLAMA_MODEL / CERN_API_BASE from .env)
"""

from __future__ import annotations

import os
import logging

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify
from flask_cors import CORS

import cern_client
import ollama_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("app")

app = Flask(__name__)
CORS(app)  # dev-friendly: allow the Vite dev server to call this API

DEFAULT_SIZE = 8
MAX_SIZE = 25


@app.get("/api/health")
def health():
    ollama_ok = ollama_client.is_available()
    models = []
    if ollama_ok:
        try:
            models = ollama_client.list_models()
        except ollama_client.OllamaUnavailable:
            ollama_ok = False

    cern_ok = True
    try:
        cern_client.search_records("test", size=1)
    except cern_client.CernApiError:
        cern_ok = False

    return jsonify(
        {
            "cern_api": "ok" if cern_ok else "unreachable",
            "ollama": "ok" if ollama_ok else "unreachable",
            "ollama_model": ollama_client.OLLAMA_MODEL,
            "ollama_models_installed": models,
        }
    )


@app.post("/api/search")
def search():
    body = request.get_json(silent=True) or {}
    user_query = (body.get("query") or "").strip()
    requested_size = body.get("size")
    use_llm_rank = body.get("use_llm_rank", True)

    if not user_query:
        return jsonify({"error": "Field 'query' is required."}), 400

    size = requested_size if isinstance(requested_size, int) else DEFAULT_SIZE
    size = max(1, min(size, MAX_SIZE))

    # ---- 1. Turn the natural-language request into search terms ---------
    model_used = None
    search_terms = user_query
    try:
        extracted = ollama_client.extract_query(user_query)
        search_terms = extracted["search_terms"]
        size = extracted.get("size", size) if not isinstance(requested_size, int) else size
        model_used = ollama_client.OLLAMA_MODEL
    except ollama_client.OllamaUnavailable:
        log.warning("Ollama unavailable — falling back to raw query as search terms")

    # ---- 2. Query CERN Open Data ------------------------------------------
    # Fetch a slightly larger pool than requested so the LLM ranker (if
    # available) has real choices to make instead of just re-ordering
    # exactly `size` items.
    fetch_pool = min(size * 3, 60) if use_llm_rank and model_used else size
    try:
        raw = cern_client.search_records(search_terms, size=fetch_pool)
    except cern_client.CernApiError as exc:
        return jsonify({"error": f"CERN Open Data API unreachable: {exc}"}), 502

    hits = raw.get("hits", {}).get("hits", [])
    total = raw.get("hits", {}).get("total", 0)
    summaries = [cern_client.summarize_hit(h) for h in hits]

    # ---- 3. Optionally rank/annotate with the local LLM --------------------
    ranking_used = False
    if use_llm_rank and model_used and summaries:
        try:
            ranked = ollama_client.annotate_results(user_query, summaries)
            if ranked:
                for s in summaries:
                    info = ranked.get(s["recid"], {})
                    s["relevance"] = info.get("relevance", 0)
                    s["why"] = info.get("why", "")
                summaries.sort(key=lambda s: s.get("relevance", 0), reverse=True)
                ranking_used = True
        except ollama_client.OllamaUnavailable:
            log.warning("Ollama became unavailable during ranking step")

    summaries = summaries[:size]

    return jsonify(
        {
            "query": user_query,
            "search_terms": search_terms,
            "total_matches": total,
            "returned": len(summaries),
            "model_used": model_used,
            "llm_ranked": ranking_used,
            "results": summaries,
        }
    )


@app.get("/api/record/<recid>")
def record(recid: str):
    try:
        data = cern_client.get_record(recid)
    except cern_client.CernApiError as exc:
        return jsonify({"error": f"CERN Open Data API unreachable: {exc}"}), 502
    return jsonify(cern_client.summarize_full_record(data))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
