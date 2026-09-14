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
import time
import logging

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

import cern_client
import guardrail
import ollama_client
import rag

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("app")

# Built React app (frontend/dist). When present and SERVE_FRONTEND=1 the
# backend serves it, so one port (5001) carries UI + API on the H100.
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
SERVE_FRONTEND = os.environ.get("SERVE_FRONTEND", "0") == "1" and os.path.isdir(DIST_DIR)

app = Flask(__name__, static_folder=DIST_DIR if SERVE_FRONTEND else None, static_url_path="")
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
            "ollama_model": ollama_client.get_model() if ollama_ok else ollama_client.OLLAMA_MODEL,
            "ollama_models_installed": models,
            "embed_model": ollama_client.EMBED_MODEL,
            "knowledge_base": "ready" if kb.ready else "empty",
            "knowledge_chunks": kb.size,
            "guardrail": {"min_score": guardrail.MIN_SCORE,
                          "low_conf_margin": guardrail.LOW_CONF_MARGIN},
            "serving_frontend": SERVE_FRONTEND,
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
        model_used = ollama_client.get_model()
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


DEFAULT_K = int(os.environ.get("RAG_TOP_K", "6"))


def _sources(hits: list[dict], cited: set[int]) -> list[dict]:
    return [
        {
            "n": i + 1,
            "title": h.get("title", ""),
            "section": h.get("section", ""),
            "experiment": h.get("experiment", ""),
            "kind": h.get("kind", "doc"),
            "source": h.get("source", ""),
            "score": round(h.get("score_raw", h.get("score", 0.0)), 3),
            "used": (i + 1) in cited,
            "snippet": h.get("text", "")[:280],
        }
        for i, h in enumerate(hits)
    ]


def _run_ask(question: str, k=None):
    """RAG with two server-side guardrails (see guardrail.py):
    a retrieval gate before the LLM and a citation check after it."""
    k = k if isinstance(k, int) and 1 <= k <= 10 else DEFAULT_K
    timing: dict[str, int] = {}

    kb = rag.get_kb()
    if not kb.ready:
        return {
            "error": "Knowledge base is empty. Build it first: "
                     "`python build_index.py` (with the H100 tunnel up).",
        }, 503

    # 1. embed the question and retrieve supporting passages
    t0 = time.time()
    try:
        qvec = ollama_client.embed(question)
    except ollama_client.OllamaUnavailable as exc:
        return {"error": f"Embedding model unavailable: {exc}"}, 502
    hits = kb.search(qvec, k=k, query_text=question)
    timing["retrieve"] = int((time.time() - t0) * 1000)

    top_score = hits[0]["score_raw"] if hits else 0.0
    gate = guardrail.retrieval_gate(top_score)
    base = {
        "question": question,
        "model_used": ollama_client.get_model(),
        "guardrail": {"status": gate, "top_score": round(top_score, 3),
                      "threshold": guardrail.MIN_SCORE, "citations_removed": 0},
        "timing_ms": timing,
    }

    # 2. retrieval gate: nothing similar enough -> refuse, never call the LLM
    if gate == "refused":
        return {**base, "answer": guardrail.REFUSAL, "grounded": False,
                "sources": _sources(hits, set())}, 200

    # 3. ask the model to answer from the passages only
    passages = [{"n": i + 1, **h} for i, h in enumerate(hits)]
    t0 = time.time()
    try:
        raw_answer = ollama_client.answer_with_context(question, passages)
    except ollama_client.OllamaUnavailable as exc:
        return {"error": f"Ollama unavailable: {exc}"}, 502
    timing["llm"] = int((time.time() - t0) * 1000)

    if raw_answer.strip().startswith(ollama_client.NOT_IN_SOURCES):
        base["guardrail"]["status"] = "refused_by_model"
        return {**base, "answer": guardrail.REFUSAL, "grounded": False,
                "sources": _sources(hits, set())}, 200

    # 4. citation check: every [n] must point at a passage we actually showed
    check = guardrail.check_citations(raw_answer, len(passages))
    if check["status"] == "no_citations":
        # one retry — small models sometimes forget the format
        try:
            retry = ollama_client.answer_with_context(
                question + "\n\n(Your previous answer had no [n] citations. "
                "Cite the passage numbers you use.)", passages)
            check = guardrail.check_citations(retry, len(passages))
        except ollama_client.OllamaUnavailable:
            pass

    cited = set(check["cited"])
    grounded = bool(cited)
    base["guardrail"]["citations_removed"] = check["removed"]
    if not grounded:
        base["guardrail"]["status"] = "no_citations"
    answer = check["answer"] if grounded else "(Unverified — no sources cited) " + check["answer"]

    return {**base, "answer": answer, "grounded": grounded,
            "sources": _sources(hits, cited)}, 200


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


if SERVE_FRONTEND:
    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path: str = "index.html"):
        """Serve the built React app; unknown paths fall back to index.html.
        /api/* routes are registered above and take precedence."""
        target = os.path.join(DIST_DIR, path)
        if path != "index.html" and os.path.isfile(target):
            return send_from_directory(DIST_DIR, path)
        return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
