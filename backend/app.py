"""
app.py — Flask backend for the CERN Data Assistant.

Endpoints:
  GET  /api/health            -> status of CERN API + Ollama + knowledge base
  POST /api/search            -> { query, size?, use_llm_rank? } -> ranked results
  POST /api/ask               -> { query } -> grounded answer + citations (RAG)
  POST /api/assistant         -> { query } -> auto-routes to search or ask
  POST /api/agent             -> { query, history? } -> plan + tools
  POST /api/agent/stream      -> SSE of the same run (live tool steps)
  GET  /api/record/<recid>    -> full metadata + file list for one record

Run with:
    python app.py
(reads PORT / OLLAMA_HOST / OLLAMA_MODEL / CERN_API_BASE from .env)
"""

from __future__ import annotations

import os
import json
import time
import logging

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_cors import CORS

import cern_client
import ollama_client
import rag
import guardrails

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("app")

# Built React app (frontend/dist). When present and SERVE_FRONTEND=1 the
# backend serves it, so one port (5001) carries UI + API on the H100.
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
SERVE_FRONTEND = os.environ.get("SERVE_FRONTEND", "0") == "1" and os.path.isdir(DIST_DIR)
DEFAULT_K = int(os.environ.get("RAG_TOP_K", "6"))

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
            "guardrails": {
                "min_top_score": guardrails.MIN_TOP_SCORE,
                "low_conf_margin": guardrails.LOW_CONF_MARGIN,
                "min_cite_score": guardrails.MIN_CITE_SCORE,
            },
            "serving_frontend": SERVE_FRONTEND,
            "cern_cache": cern_client.cache_stats(),
        }
    )


# ---------------------------------------------------------------------------
# Core logic (reused by the direct routes and by the /api/assistant router).
# Each helper returns (payload_dict, http_status).
# ---------------------------------------------------------------------------

def broadening_attempts(terms: str) -> list[str]:
    """Keyword ladder for CERN's strict AND search: full query, then drop
    trailing words one by one, then the first word alone."""
    return cern_client.broadening_attempts(terms)


def _fetch_with_broadening(terms: str, pool: int):
    """Retry with progressively fewer keywords until CERN returns hits.
    Returns (raw, used_terms, broadened)."""
    ordered = broadening_attempts(terms)
    last_raw = None
    for attempt in ordered:
        raw = cern_client.search_records(attempt, size=pool)
        if raw.get("hits", {}).get("total", 0):
            return raw, attempt, attempt != terms
        last_raw = raw
    return last_raw, ordered[-1], True


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

    # 2. Query CERN Open Data (fetch a larger pool so the ranker has choices),
    #    broadening the query if the first, most-specific attempt returns 0.
    fetch_pool = min(size * 3, 60) if use_llm_rank and model_used else size
    try:
        raw, used_terms, broadened = _fetch_with_broadening(search_terms, fetch_pool)
    except cern_client.CernApiError as exc:
        return {"error": f"CERN Open Data API unreachable: {exc}"}, 502

    search_terms = used_terms
    hits = raw.get("hits", {}).get("hits", []) if raw else []
    total = raw.get("hits", {}).get("total", 0) if raw else 0
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
        "broadened": broadened,
        "total_matches": total,
        "returned": len(summaries),
        "model_used": model_used,
        "llm_ranked": ranking_used,
        "results": summaries,
    }, 200


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


def _refusal(question: str, message: str, rail: str, sources=None,
             detail: dict | None = None, timing: dict | None = None):
    """Uniform ungrounded response shape used by every guardrail refusal."""
    return {
        "question": question,
        "answer": message,
        "grounded": False,
        "model_used": ollama_client.get_model(),
        "guardrail": rail,
        "guardrail_detail": {"status": "blocked", "top_score": 0.0,
                             "threshold": guardrails.MIN_TOP_SCORE,
                             "citations_removed": 0, **(detail or {})},
        "sources": sources or [],
        "timing_ms": timing or {},
    }, 200


def _run_ask(question: str, k=None):
    """RAG answer wrapped in the guardrails (guardrails.py), in order:
    input rail -> retrieval gate (before the LLM) -> answer -> citation
    rewrite -> LLM fact-check. The model never decides its own grounding."""
    k = k if isinstance(k, int) and 1 <= k <= 10 else DEFAULT_K
    timing: dict[str, int] = {}

    # --- INPUT rail: block unsafe / injection before any model call ---------
    blocked = guardrails.screen_query(question)
    if blocked:
        return _refusal(question, blocked["message"], f"input:{blocked['category']}")

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
    gate = guardrails.retrieval_gate(top_score)
    detail = {"status": gate, "top_score": round(top_score, 3),
              "threshold": guardrails.MIN_TOP_SCORE, "citations_removed": 0}

    # --- RETRIEVAL rail: no CERN source above the floor -> refuse, no LLM ----
    if gate == "refused":
        return _refusal(question, guardrails.NO_SOURCE_MESSAGE, "retrieval:no_source",
                        sources=_sources(hits, set()), detail=detail, timing=timing)

    # 2. ask the model to answer from the numbered passages only
    passages = [{"n": i + 1, **h} for i, h in enumerate(hits)]
    t0 = time.time()
    try:
        raw_answer = ollama_client.answer_with_context(question, passages)
    except ollama_client.OllamaUnavailable as exc:
        return {"error": f"Ollama unavailable: {exc}"}, 502
    timing["llm"] = int((time.time() - t0) * 1000)

    if raw_answer.strip().startswith(ollama_client.NOT_IN_SOURCES):
        detail["status"] = "refused_by_model"
        return _refusal(question, guardrails.NO_SOURCE_MESSAGE, "model:not_in_sources",
                        sources=_sources(hits, set()), detail=detail, timing=timing)

    # --- CITATION rail: every [n] must point at a shown, relevant passage ----
    check = guardrails.check_citations(raw_answer, passages)
    if check["status"] == "no_citations":
        try:  # one retry — smaller models sometimes forget the format
            retry = ollama_client.answer_with_context(
                question + "\n\n(Your previous answer had no [n] citations. "
                "Cite the passage numbers you use.)", passages)
            check = guardrails.check_citations(retry, passages)
        except ollama_client.OllamaUnavailable:
            pass
    detail["citations_removed"] = check["removed"]
    cited = set(check["cited"])
    if not cited:
        detail["status"] = "no_citations"
        return _refusal(question, guardrails.NO_SOURCE_MESSAGE, "citation:none",
                        sources=_sources(hits, set()), detail=detail, timing=timing)
    answer = check["answer"]

    # --- CITE-OR-DROP: weak retrieval -> every surviving sentence is cited ---
    detail["sentences_removed"] = 0
    if gate == "low_confidence":
        trimmed = guardrails.strip_uncited_sentences(answer)
        detail["sentences_removed"] = trimmed["removed"]
        if not trimmed["answer"]:
            detail["status"] = "no_citations"
            return _refusal(question, guardrails.NO_SOURCE_MESSAGE, "citation:none",
                            sources=_sources(hits, set()), detail=detail, timing=timing)
        answer = trimmed["answer"]
        cited = {n for n in cited if f"[{n}]" in answer} or cited

    # --- GROUNDING rail: fact-check the answer against the cited passages ---
    rail = "grounded" if gate == "ok" else "grounded:low_confidence"
    cited_passages = [p for p in passages if p["n"] in cited]
    if gate == "low_confidence":
        strong = [
            p for p in cited_passages
            if p.get("score_raw", p.get("score", 0.0)) >= guardrails.MIN_TOP_SCORE
        ]
        if not strong:
            detail["status"] = "low_confidence"
            return _refusal(
                question, guardrails.NO_SOURCE_MESSAGE, "grounding:low_confidence",
                sources=_sources(hits, cited), detail=detail, timing=timing,
            )
    t0 = time.time()
    try:
        verdict = ollama_client.verify_grounding(answer, cited_passages)
        timing["verify"] = int((time.time() - t0) * 1000)
        if not verdict.get("supported", True):
            log.info("grounding rail rejected answer; unsupported=%s", verdict.get("unsupported"))
            detail["status"] = "unsupported"
            detail["unsupported"] = verdict.get("unsupported", [])
            return _refusal(question, guardrails.UNSUPPORTED_MESSAGE, "grounding:unsupported",
                            sources=_sources(hits, cited), detail=detail, timing=timing)
    except ollama_client.OllamaUnavailable:
        rail = "grounded:unverified"  # fact-check unreachable; keep the cited answer

    return {
        "question": question,
        "answer": answer,
        "grounded": True,
        "model_used": ollama_client.get_model(),
        "guardrail": rail,
        "guardrail_detail": detail,
        "sources": _sources(hits, cited),
        "timing_ms": timing,
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

    # INPUT rail applies to both routes.
    blocked = guardrails.screen_query(user_query)
    if blocked:
        payload, _ = _refusal(user_query, blocked["message"], f"input:{blocked['category']}")
        return jsonify({"mode": "ask", "route_confidence": 100, **payload}), 200

    route = ollama_client.classify_intent(user_query)
    intent = route["intent"]

    if intent == "search":
        payload, status = _run_search(user_query, body.get("size"))
    else:
        payload, status = _run_ask(user_query, body.get("k"))

    if status == 200:
        payload = {"mode": intent, "route_confidence": route["confidence"], **payload}
    return jsonify(payload), status


def _fetch_top_record(search_payload: dict) -> dict | None:
    """Agent tool: pull the full CERN record for the top dataset so the UI
    can show real files / license, not just the search snippet."""
    results = search_payload.get("results") or []
    pick = next((r for r in results if r.get("is_dataset")), results[0] if results else None)
    if not pick:
        return None
    try:
        raw = cern_client.get_record(pick["recid"])
        detail = cern_client.summarize_full_record(raw)
    except cern_client.CernApiError as exc:
        log.warning("fetch_record failed for %s: %s", pick.get("recid"), exc)
        return None
    files = (detail.get("files") or [])[:6]
    return {
        "recid": detail.get("recid"),
        "title": detail.get("title"),
        "size": detail.get("size"),
        "file_count": detail.get("file_count"),
        "formats": detail.get("formats") or [],
        "usage": detail.get("usage"),
        "url": detail.get("url"),
        "license": detail.get("license"),
        "files": files,
    }


def _followups(plan: dict, search, answer) -> list[str]:
    """Deterministic next questions a researcher would actually type."""
    out: list[str] = []
    if search and (search.get("results") or []):
        top = search["results"][0]
        exp = (top.get("experiment") or "").split(",")[0].strip()
        if exp and exp != "—":
            out.append(f"Why does {exp} use its magnet system?")
        out.append("How do I download the top dataset?")
        if top.get("formats"):
            fmt = top["formats"][0]
            out.append(f"What is a {fmt} file and how do I open it?")
    if answer and answer.get("grounded"):
        out.append("Find open datasets related to this")
        out.append("Compare CMS and ATLAS detectors")
    if answer and not answer.get("grounded"):
        out.append("Why does CMS use a solenoid?")
        out.append("proton-proton collisions at 13 TeV with muons")
    # de-dupe, cap
    seen, uniq = set(), []
    for q in out:
        if q not in seen:
            seen.add(q)
            uniq.append(q)
    return uniq[:4]


def _agent_events(user_query: str, body: dict, history=None):
    """Yield SSE-shaped dicts, last one type=result with the full payload."""
    blocked = guardrails.screen_query(user_query)
    if blocked:
        refusal, _ = _refusal(user_query, blocked["message"], f"input:{blocked['category']}")
        payload = {
            "query": user_query,
            "goal": user_query,
            "tools_used": [],
            "plan": {"search_query": None, "ask_query": None},
            "search": None,
            "answer": refusal,
            "picked": None,
            "followups": _followups({}, None, refusal),
        }
        yield {"type": "result", "payload": payload}
        return

    yield {"type": "status", "step": "planning", "label": "Planning which tools to run"}
    plan = ollama_client.plan_tasks(user_query, history=history)
    yield {
        "type": "plan",
        "goal": plan.get("goal"),
        "search_query": plan.get("search_query"),
        "ask_query": plan.get("ask_query"),
    }

    tools_used: list[str] = []
    search_payload = None
    answer_payload = None
    retried_with = None

    if plan.get("search_query"):
        yield {"type": "status", "step": "search", "label": f"Searching CERN Open Data for “{plan['search_query']}”"}
        sp, sstatus = _run_search(plan["search_query"], body.get("size"))
        if sstatus == 200:
            search_payload = sp
            tools_used.append("search")
            if not (sp.get("results") or []):
                alt = cern_client.fallback_search_query(plan["search_query"])
                if alt:
                    yield {"type": "status", "step": "search", "label": f"No hits — retrying as “{alt}”"}
                    sp2, s2 = _run_search(alt, body.get("size"))
                    if s2 == 200 and (sp2.get("results") or []):
                        search_payload = sp2
                        retried_with = alt
        n = (search_payload or {}).get("returned") or 0
        yield {"type": "tool_done", "tool": "search", "hits": n}

    if plan.get("ask_query"):
        yield {"type": "status", "step": "ask", "label": "Retrieving CERN sources and writing a grounded answer"}
        ap, astatus = _run_ask(plan["ask_query"], body.get("k"))
        if astatus == 200:
            answer_payload = ap
            tools_used.append("ask")
        yield {
            "type": "tool_done",
            "tool": "ask",
            "grounded": bool((answer_payload or {}).get("grounded")),
        }

    picked = None
    if search_payload and (search_payload.get("results") or []):
        yield {"type": "status", "step": "fetch_record", "label": "Opening the top dataset record"}
        picked = _fetch_top_record(search_payload)
        if picked:
            tools_used.append("fetch_record")
            for r in search_payload["results"]:
                if str(r.get("recid")) == str(picked["recid"]):
                    r["files"] = picked["files"]
                    r["license"] = picked.get("license")
                    r["picked"] = True
                    break
        yield {"type": "tool_done", "tool": "fetch_record", "recid": (picked or {}).get("recid")}

    payload = {
        "query": user_query,
        "goal": plan.get("goal", user_query),
        "plan": {
            "search_query": retried_with or plan.get("search_query"),
            "ask_query": plan.get("ask_query"),
            "retried": retried_with,
        },
        "tools_used": tools_used,
        "search": search_payload,
        "answer": answer_payload,
        "picked": picked,
        "followups": _followups(plan, search_payload, answer_payload),
    }
    yield {"type": "result", "payload": payload}


@app.post("/api/agent")
def agent():
    """Agentic entry point: plan over search + grounded Q&A, retry empty
    searches, then fetch the top record's files."""
    body = request.get_json(silent=True) or {}
    user_query = (body.get("query") or "").strip()
    if not user_query:
        return jsonify({"error": "Field 'query' is required."}), 400
    history = body.get("history") if isinstance(body.get("history"), list) else None
    payload = None
    for ev in _agent_events(user_query, body, history):
        if ev.get("type") == "result":
            payload = ev["payload"]
    return jsonify(payload), 200


@app.post("/api/agent/stream")
def agent_stream():
    """Same as /api/agent but Server-Sent Events so the UI can show live steps."""
    body = request.get_json(silent=True) or {}
    user_query = (body.get("query") or "").strip()
    if not user_query:
        return jsonify({"error": "Field 'query' is required."}), 400
    history = body.get("history") if isinstance(body.get("history"), list) else None

    def gen():
        try:
            for ev in _agent_events(user_query, body, history):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            log.exception("agent stream failed")
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"

    return Response(
        stream_with_context(gen()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


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
