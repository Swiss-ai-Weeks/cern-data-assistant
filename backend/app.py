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
from analysis.service import bp as investigations_bp, init_investigation_worker
from analysis import constraints as analysis_constraints

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("app")

# Built React app (frontend/dist). When present and SERVE_FRONTEND=1 the
# backend serves it, so one port (5001) carries UI + API on the H100.
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
SERVE_FRONTEND = os.environ.get("SERVE_FRONTEND", "0") == "1" and os.path.isdir(DIST_DIR)
EXPAND_ENABLED = os.environ.get("RAG_EXPAND", "1") == "1"
DEFAULT_K = int(os.environ.get("RAG_TOP_K", "6"))

app = Flask(__name__, static_folder=DIST_DIR if SERVE_FRONTEND else None, static_url_path="")
CORS(app)  # dev-friendly: allow the Vite dev server to call this API
app.register_blueprint(investigations_bp)
init_investigation_worker(app)

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
    investigation = {"sample_prepared": False, "recommended_gunicorn_workers": 1}
    try:
        from analysis.service import directory

        investigation["sample_prepared"] = (directory() / "manifest.json").exists()
    except RuntimeError:
        pass
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
            "investigation": investigation,
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


def _fetch_with_broadening(terms: str, pool: int, facets: dict | None = None):
    """Retry with progressively fewer keywords until CERN returns hits, and
    if the whole keyword ladder is empty, loosen the facets one at a time
    (collision type -> energy -> experiment -> none) and climb again.
    Returns (raw, used_terms, broadened, used_facets)."""
    ordered = broadening_attempts(terms)
    last_raw = None
    for fac in cern_client.facet_ladder(facets or {}):
        for attempt in ordered:
            raw = cern_client.search_records(attempt, size=pool, facets=fac)
            if raw.get("hits", {}).get("total", 0):
                _merge_alias_hits(raw, attempt, pool, fac)
                return raw, attempt, (attempt != terms or fac != (facets or {})), fac
            last_raw = raw
    return last_raw, ordered[-1], True, {}


def _merge_alias_hits(raw: dict, terms: str, pool: int, facets: dict) -> None:
    """Add CMS primary-dataset hits (/DoubleMuon, /SingleMuon, ...) for the
    physics keywords in `terms` to the pool, de-duplicated by record id.
    Best effort: an alias search failure never breaks the main search."""
    seen = {h.get("id") for h in raw.get("hits", {}).get("hits", [])}
    extra: list[dict] = []
    for alias in cern_client.alias_queries(terms):
        try:
            more = cern_client.search_records(alias, size=min(pool, 10), facets=facets)
        except cern_client.CernApiError:
            continue
        for h in more.get("hits", {}).get("hits", []):
            if h.get("id") not in seen:
                seen.add(h.get("id"))
                extra.append(h)
    if extra:
        raw["hits"]["hits"] = raw["hits"]["hits"] + extra
        raw["hits"]["total"] = raw["hits"].get("total", 0) + len(extra)
        raw["aliases"] = cern_client.alias_queries(terms)


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

    # 2. Facets: energy / collision type / experiment / dataset-only are sent
    #    to CERN as exact filters, and removed from the keyword query so the
    #    strict AND search only has to match the physics terms.
    facets = cern_client.extract_facets(user_query)
    if facets:
        search_terms = cern_client.strip_facet_terms(search_terms, facets)

    # 3. Query CERN Open Data (fetch a larger pool so the ranker has choices),
    #    broadening keywords, then facets, if the most specific attempt is empty.
    fetch_pool = min(size * 3, 60) if use_llm_rank and model_used else size
    try:
        raw, used_terms, broadened, facets_used = _fetch_with_broadening(
            search_terms, fetch_pool, facets)
    except cern_client.CernApiError as exc:
        return {"error": f"CERN Open Data API unreachable: {exc}"}, 502

    search_terms = used_terms
    hits = raw.get("hits", {}).get("hits", []) if raw else []
    total = raw.get("hits", {}).get("total", 0) if raw else 0
    # Deterministic pre-rank (collision data first, keyword in title, readable
    # title) so the LLM ranker and the size cut see the useful records first.
    hits = cern_client.order_pool(hits, user_query, search_terms)[:fetch_pool]
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

    payload = {
        "query": user_query,
        "search_terms": search_terms,
        "facets": facets_used,
        "facets_requested": facets,
        "aliases": (raw or {}).get("aliases", []),
        "broadened": broadened,
        "total_matches": total,
        "returned": len(summaries),
        "model_used": model_used,
        "llm_ranked": ranking_used,
        "results": summaries,
    }
    return analysis_constraints.enrich_search(user_query, payload), 200


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
    payload = {
        "question": question,
        "answer": message,
        "grounded": False,
        "model_used": ollama_client.get_model(),
        "guardrail": rail,
        "guardrail_detail": {"status": "blocked", "top_score": 0.0,
                             "threshold": guardrails.MIN_TOP_SCORE,
                             "citations_removed": 0, **(detail or {})},
        "sources": sources or [],
        "timing_ms": dict(timing or {}),
        "ungrounded_draft": None,
        "draft_model": None,
    }
    # Never draft for injection / unsafe — only for "would have hallucinated physics".
    if ollama_client.draft_allowed(rail):
        t0 = time.time()
        draft = ollama_client.ungrounded_draft(question)
        payload["timing_ms"]["draft"] = int((time.time() - t0) * 1000)
        if draft:
            payload["ungrounded_draft"] = draft
            payload["draft_model"] = ollama_client.OLLAMA_FALLBACK_MODEL
    return payload, 200


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

    # --- GLOSSARY-GRAPH EXPANSION: only when the gate would refuse ----------
    # Map the question to CERN glossary terms (+ their "see also" / nearest
    # neighbours) and retry once, e.g. "atom" -> nucleus, proton, electron,
    # ion. The LLM only proposes candidates; the glossary decides which
    # survive, and an expanded answer is always held to the low-confidence
    # rails (every sentence cited, one passage above the floor).
    if gate == "refused" and EXPAND_ENABLED and hits:
        t0 = time.time()
        terms = kb.expand_terms(ollama_client.suggest_glossary_terms(question))
        detail["expansion_tried"] = terms
        if terms:
            expanded = f"{question} ({', '.join(terms)})"
            try:
                hits2 = kb.search(ollama_client.embed(expanded), k=k, query_text=expanded)
            except ollama_client.OllamaUnavailable:
                hits2 = []
            if hits2 and guardrails.retrieval_gate(hits2[0]["score_raw"]) != "refused":
                hits, gate = hits2, "low_confidence"
                top_score = hits[0]["score_raw"]
                detail.update(status=gate, top_score=round(top_score, 3),
                              expanded_terms=terms, expansion="glossary_graph")
                log.info("glossary expansion rescued %r via %s (top %.3f)",
                         question, terms, top_score)
        timing["expand"] = int((time.time() - t0) * 1000)

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
        if verdict.get("supported") is not True or verdict.get("unsupported"):
            log.info("grounding rail rejected answer; unsupported=%s", verdict.get("unsupported"))
            detail["status"] = "unsupported"
            detail["unsupported"] = verdict.get("unsupported", [])
            return _refusal(question, guardrails.UNSUPPORTED_MESSAGE, "grounding:unsupported",
                            sources=_sources(hits, cited), detail=detail, timing=timing)
    except ollama_client.OllamaUnavailable:
        detail["status"] = "unverified"
        return _refusal(
            question, "I could not verify this answer against the CERN sources. Please try again.",
            "grounding:unverified", sources=_sources(hits, cited), detail=detail, timing=timing,
        )

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
        "experiment": detail.get("experiment"),
        "collision_energy": detail.get("collision_energy"),
        "size": detail.get("size"),
        "file_count": detail.get("file_count"),
        "formats": detail.get("formats") or [],
        "doi": detail.get("doi"),
        "citation": detail.get("citation"),
        "usage": detail.get("usage"),
        "url": detail.get("url"),
        "license": detail.get("license"),
        "files": files,
    }


def _try_investigation_agent(user_query: str):
    from analysis.investigation_agent import handle_query
    from analysis.service import compare_run_payload, directory, materialize, merged_sources

    def sample_ready():
        try:
            return (directory() / "manifest.json").exists()
        except RuntimeError:
            return False

    return handle_query(
        user_query,
        materialize_fn=materialize,
        sample_ready_fn=sample_ready,
        merged_sources_fn=lambda: merged_sources(cached_verbatim=True),
        compare_fn=compare_run_payload,
    )


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


def _sse(ev: dict, t0: float) -> dict:
    """Attach elapsed_ms for the UI timeline (additive; clients may ignore)."""
    out = dict(ev)
    out["elapsed_ms"] = int((time.time() - t0) * 1000)
    return out


def _agent_events(user_query: str, body: dict, history=None):
    """Yield SSE-shaped dicts, last one type=result with the full payload."""
    t0 = time.time()
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
        yield _sse({"type": "result", "payload": payload}, t0)
        return

    inv_payload = _try_investigation_agent(user_query)
    if inv_payload:
        yield _sse(
            {
                "type": "status",
                "step": "investigation",
                "timeline_stage": "interpret_intent",
                "label": "Run bounded CMS dimuon investigation",
            },
            t0,
        )
        yield _sse(
            {
                "type": "tool_done",
                "tool": "investigation",
                "timeline_stage": "verify_grounding",
                "investigation": inv_payload.get("investigation"),
                "meta": {
                    "run_id": (inv_payload.get("investigation") or {}).get("run", {}).get("id"),
                    "claims": len((inv_payload.get("investigation") or {}).get("claims") or []),
                },
            },
            t0,
        )
        yield _sse({"type": "result", "payload": inv_payload}, t0)
        try:
            from store import get_store

            st = get_store()
            inv = inv_payload.get("investigation") or {}
            run = inv.get("run") or {}
            st.add_event(
                "agent-investigation",
                None,
                "investigation_complete",
                {
                    "query": user_query,
                    "run_id": run.get("id"),
                    "selected_events": run.get("selected_events"),
                },
            )
        except Exception:
            log.debug("investigation audit log skipped", exc_info=True)
        return

    yield _sse(
        {
            "type": "status",
            "step": "planning",
            "timeline_stage": "interpret_intent",
            "label": "Interpret scientific intent",
        },
        t0,
    )
    plan = ollama_client.plan_tasks(user_query, history=history)
    yield _sse(
        {
            "type": "plan",
            "goal": plan.get("goal"),
            "search_query": plan.get("search_query"),
            "ask_query": plan.get("ask_query"),
        },
        t0,
    )

    tools_used: list[str] = []
    search_payload = None
    answer_payload = None
    retried_with = None

    if plan.get("search_query"):
        yield _sse(
            {
                "type": "status",
                "step": "search",
                "timeline_stage": "search_catalog",
                "label": f"Search CERN Open Data catalog — “{plan['search_query']}”",
            },
            t0,
        )
        sp, sstatus = _run_search(plan["search_query"], body.get("size"))
        if sstatus == 200:
            search_payload = sp
            tools_used.append("search")
            if not (sp.get("results") or []):
                alt = cern_client.fallback_search_query(plan["search_query"])
                if alt:
                    yield _sse(
                        {
                            "type": "status",
                            "step": "search",
                            "timeline_stage": "search_catalog",
                            "label": f"No exact match — broadening search to “{alt}”",
                        },
                        t0,
                    )
                    sp2, s2 = _run_search(alt, body.get("size"))
                    if s2 == 200 and (sp2.get("results") or []):
                        search_payload = sp2
                        retried_with = alt
        n = (search_payload or {}).get("returned") or 0
        if search_payload and search_payload.get("llm_ranked"):
            yield _sse(
                {
                    "type": "status",
                    "step": "search",
                    "timeline_stage": "rank_records",
                    "label": "Rank matching records for your question",
                },
                t0,
            )
        yield _sse(
            {
                "type": "tool_done",
                "tool": "search",
                "timeline_stage": "rank_records",
                "hits": n,
                "search": search_payload,
                "meta": {
                    "total_matches": (search_payload or {}).get("total_matches"),
                    "returned": n,
                    "broadened": (search_payload or {}).get("broadened"),
                    "llm_ranked": (search_payload or {}).get("llm_ranked"),
                },
            },
            t0,
        )

    if plan.get("ask_query"):
        yield _sse(
            {
                "type": "status",
                "step": "ask",
                "timeline_stage": "retrieve_docs",
                "label": "Retrieve supporting CERN documentation",
            },
            t0,
        )
        ap, astatus = _run_ask(plan["ask_query"], body.get("k"))
        if astatus == 200:
            answer_payload = ap
            tools_used.append("ask")
        gd = (answer_payload or {}).get("guardrail_detail") or {}
        cited_n = len([s for s in (answer_payload or {}).get("sources") or [] if s.get("used")])
        yield _sse(
            {
                "type": "status",
                "step": "ask",
                "timeline_stage": "verify_grounding",
                "label": "Verify grounding and citations",
            },
            t0,
        )
        yield _sse(
            {
                "type": "tool_done",
                "tool": "ask",
                "timeline_stage": "verify_grounding",
                "grounded": bool((answer_payload or {}).get("grounded")),
                "answer": answer_payload,
                "meta": {
                    "top_score": gd.get("top_score"),
                    "threshold": gd.get("threshold"),
                    "sources_retrieved": len((answer_payload or {}).get("sources") or []),
                    "sources_cited": cited_n,
                    "guardrail": (answer_payload or {}).get("guardrail"),
                    "verify_ms": ((answer_payload or {}).get("timing_ms") or {}).get("verify"),
                },
            },
            t0,
        )

    picked = None
    if search_payload and (search_payload.get("results") or []):
        yield _sse(
            {
                "type": "status",
                "step": "fetch_record",
                "timeline_stage": "prepare_handoff",
                "label": "Prepare research handoff",
            },
            t0,
        )
        picked = _fetch_top_record(search_payload)
        if picked:
            tools_used.append("fetch_record")
            for r in search_payload["results"]:
                if str(r.get("recid")) == str(picked["recid"]):
                    r["files"] = picked["files"]
                    r["license"] = picked.get("license")
                    r["picked"] = True
                    break
        yield _sse(
            {
                "type": "tool_done",
                "tool": "fetch_record",
                "timeline_stage": "prepare_handoff",
                "recid": (picked or {}).get("recid"),
                "picked": picked,
                "search": search_payload,
                "meta": {"file_count": (picked or {}).get("file_count")},
            },
            t0,
        )

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
    yield _sse({"type": "result", "payload": payload}, t0)


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
