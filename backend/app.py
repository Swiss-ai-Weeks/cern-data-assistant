"""
app.py — Flask backend for the CERN Data Assistant.

Endpoints:
  GET  /api/health            -> status of CERN API + Ollama + knowledge base
  POST /api/search            -> { query, size?, use_llm_rank? } -> ranked results
  POST /api/ask               -> { query } -> grounded answer + citations (RAG)
  POST /api/assistant         -> { query } -> auto-routes to search or ask
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
import rag

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

    kb = rag.get_kb()
    return jsonify(
        {
            "cern_api": "ok" if cern_ok else "unreachable",
            "ollama": "ok" if ollama_ok else "unreachable",
            "ollama_model": ollama_client.OLLAMA_MODEL,
            "ollama_models_installed": models,
            "knowledge_base": "ready" if kb.ready else "empty",
            "knowledge_chunks": kb.size,
        }
    )


# ---------------------------------------------------------------------------
# Core logic (reused by the direct routes and by the /api/assistant router).
# Each helper returns (payload_dict, http_status).
# ---------------------------------------------------------------------------

def _run_search(user_query: str, requested_size=None, use_llm_rank: bool = True):
    size = requested_size if isinstance(requested_size, int) else DEFAULT_SIZE
    size = max(1, min(size, MAX_SIZE))

    # 1. Turn the natural-language request into search terms
    model_used = None
    search_terms = user_query
    try:
        extracted = ollama_client.extract_query(user_query)
        search_terms = extracted["search_terms"]
        size = extracted.get("size", size) if not isinstance(requested_size, int) else size
        model_used = ollama_client.OLLAMA_MODEL
    except ollama_client.OllamaUnavailable:
        log.warning("Ollama unavailable — falling back to raw query as search terms")

    # 2. Query CERN Open Data (fetch a larger pool so the ranker has choices)
    fetch_pool = min(size * 3, 60) if use_llm_rank and model_used else size
    try:
        raw = cern_client.search_records(search_terms, size=fetch_pool)
    except cern_client.CernApiError as exc:
        return {"error": f"CERN Open Data API unreachable: {exc}"}, 502

    hits = raw.get("hits", {}).get("hits", [])
    total = raw.get("hits", {}).get("total", 0)
    summaries = [cern_client.summarize_hit(h) for h in hits]

    # 3. Optionally rank/annotate with the local LLM
    ranking_used = False
    if use_llm_rank and model_used and summaries:
        try:
            ranked = ollama_client.annotate_results(user_query, summaries)
            if ranked:
                for s in summaries:
                    info = ranked.get(s["recid"], {})
                    s["relevance"] = info.get("relevance", 0)
                    s["why"] = info.get("why", "")
                ranking_used = True
        except ollama_client.OllamaUnavailable:
            log.warning("Ollama became unavailable during ranking step")

    # 4. Order results: real datasets first, then relevance (stable sorts)
    summaries.sort(key=lambda s: 0 if s.get("is_dataset") else 1)
    if ranking_used:
        summaries.sort(key=lambda s: s.get("relevance", 0), reverse=True)

    summaries = summaries[:size]

    return {
        "query": user_query,
        "search_terms": search_terms,
        "total_matches": total,
        "returned": len(summaries),
        "model_used": model_used,
        "llm_ranked": ranking_used,
        "results": summaries,
    }, 200


def _run_ask(question: str, k=None):
    k = k if isinstance(k, int) and 1 <= k <= 10 else 4

    kb = rag.get_kb()
    if not kb.ready:
        return {
            "error": "Knowledge base is empty. Build it first: "
                     "`python build_index.py` (with the H100 tunnel up).",
        }, 503

    # 1. embed the question and retrieve supporting passages
    try:
        qvec = ollama_client.embed(question)
    except ollama_client.OllamaUnavailable as exc:
        return {"error": f"Embedding model unavailable: {exc}"}, 502

    hits = kb.search(qvec, k=k)
    if not hits:
        return {
            "question": question,
            "answer": "I don't have a CERN source that covers that yet.",
            "grounded": False,
            "sources": [],
        }, 200

    # 2. build numbered passages and ask the model to answer from them only
    passages = [
        {"n": i + 1, "title": h["title"], "text": h["text"], "source": h["source"]}
        for i, h in enumerate(hits)
    ]
    try:
        result = ollama_client.answer_with_context(question, passages)
    except ollama_client.OllamaUnavailable as exc:
        return {"error": f"Ollama unavailable: {exc}"}, 502

    used = set(result.get("used") or [])
    sources = [
        {
            "n": p["n"],
            "title": p["title"],
            "source": p["source"],
            "score": round(hits[p["n"] - 1].get("score", 0.0), 3),
            "used": p["n"] in used,
        }
        for p in passages
    ]

    return {
        "question": question,
        "answer": result.get("answer", ""),
        "grounded": result.get("grounded", False),
        "model_used": ollama_client.OLLAMA_MODEL,
        "sources": sources,
    }, 200


@app.post("/api/search")
def search():
    body = request.get_json(silent=True) or {}
    user_query = (body.get("query") or "").strip()
    if not user_query:
        return jsonify({"error": "Field 'query' is required."}), 400
    payload, status = _run_search(
        user_query, body.get("size"), body.get("use_llm_rank", True)
    )
    return jsonify(payload), status


@app.post("/api/ask")
def ask():
    """RAG endpoint: answer a knowledge question about CERN experiments,
    detectors and open data, grounded in the knowledge base with citations."""
    body = request.get_json(silent=True) or {}
    question = (body.get("query") or body.get("question") or "").strip()
    if not question:
        return jsonify({"error": "Field 'query' is required."}), 400
    payload, status = _run_ask(question, body.get("k"))
    return jsonify(payload), status


@app.post("/api/assistant")
def assistant():
    """Unified entry point: classify the message, then either search CERN Open
    Data or answer a grounded question. Returns the chosen `mode` plus the
    matching payload so a single UI box can serve both."""
    body = request.get_json(silent=True) or {}
    user_query = (body.get("query") or "").strip()
    if not user_query:
        return jsonify({"error": "Field 'query' is required."}), 400

    route = ollama_client.classify_intent(user_query)
    intent = route["intent"]

    if intent == "search":
        payload, status = _run_search(user_query, body.get("size"))
    else:
        payload, status = _run_ask(user_query, body.get("k"))

    if status == 200:
        payload = {"mode": intent, "route_confidence": route["confidence"], **payload}
    return jsonify(payload), status


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
