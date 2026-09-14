"""
ollama_client.py

Talks to a local Ollama server (https://ollama.com) to:
  1. turn a free-form user question into good CERN Open Data search terms
  2. rank/annotate the resulting records for relevance back to the question

Both calls use Ollama's `format: "json"` mode so we get back parseable JSON
instead of having to regex a chat reply. Everything here is best-effort:
if Ollama isn't running, the caller (app.py) falls back to a plain keyword
search with no ranking, so the app still works without a local LLM.
"""

from __future__ import annotations

import os
import json
import time
import logging
from typing import Any, Optional

import requests

log = logging.getLogger("ollama_client")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
# Used automatically when OLLAMA_MODEL is not pulled on the Ollama host, so a
# demo never blocks on a 20 GB download.
OLLAMA_FALLBACK_MODEL = os.environ.get("OLLAMA_FALLBACK_MODEL", "llama3.2")
EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
REQUEST_TIMEOUT = 60
ANSWER_TIMEOUT = 180  # 32B model, long context: allow a slow first answer
EMBED_TIMEOUT = 120  # first call cold-loads the model on the GPU
# keep_alive=-1: never unload the model between requests (demo latency).
CHAT_OPTIONS = {"temperature": 0.2, "num_ctx": 8192}

# nomic-embed-text is trained with task prefixes; using them measurably
# improves retrieval. The index and the query MUST use matching prefixes.
EMBED_DOC_PREFIX = "search_document: "
EMBED_QUERY_PREFIX = "search_query: "


class OllamaUnavailable(RuntimeError):
    """Raised when the local Ollama server can't be reached."""


def is_available() -> bool:
    try:
        r = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=3)
        return r.ok
    except requests.RequestException:
        return False


def list_models() -> list[str]:
    try:
        r = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=5)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("models", [])]
    except requests.RequestException as exc:
        raise OllamaUnavailable(str(exc)) from exc


_model_cache: dict[str, Any] = {"name": None, "at": 0.0}


def get_model() -> str:
    """OLLAMA_MODEL if the Ollama host has it, else OLLAMA_FALLBACK_MODEL.
    Cached for 60 s so we don't hit /api/tags on every request."""
    now = time.time()
    if _model_cache["name"] and now - _model_cache["at"] < 60:
        return _model_cache["name"]
    chosen = OLLAMA_MODEL
    try:
        installed = list_models()
        names = set(installed) | {n.split(":")[0] for n in installed}
        if OLLAMA_MODEL not in names and OLLAMA_MODEL.split(":")[0] not in names:
            log.warning("model %s not installed; falling back to %s",
                        OLLAMA_MODEL, OLLAMA_FALLBACK_MODEL)
            chosen = OLLAMA_FALLBACK_MODEL
    except OllamaUnavailable:
        pass
    _model_cache.update(name=chosen, at=now)
    return chosen


def _chat(system: str, user: str, model: Optional[str], *, json_mode: bool,
          timeout: int, temperature: float) -> str:
    payload = {
        "model": model or get_model(),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "keep_alive": -1,
        "options": {**CHAT_OPTIONS, "temperature": temperature},
    }
    if json_mode:
        payload["format"] = "json"
    try:
        resp = requests.post(f"{OLLAMA_HOST}/api/chat", json=payload, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise OllamaUnavailable(str(exc)) from exc
    return resp.json().get("message", {}).get("content", "")


def _chat_json(system: str, user: str, model: Optional[str] = None,
               temperature: float = 0.2) -> dict:
    """Call Ollama's chat endpoint in JSON mode and parse the result."""
    content = _chat(system, user, model, json_mode=True,
                    timeout=REQUEST_TIMEOUT, temperature=temperature) or "{}"
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        log.warning("Ollama returned non-JSON content: %r", content)
        return {}


def chat_text(system: str, user: str, model: Optional[str] = None,
              timeout: int = ANSWER_TIMEOUT, temperature: float = 0.1) -> str:
    """Plain-text chat call (no JSON mode) for prose answers."""
    return _chat(system, user, model, json_mode=False,
                 timeout=timeout, temperature=temperature).strip()


EXTRACT_SYSTEM_PROMPT = """You turn a scientist's plain-language request into a \
search query for the CERN Open Data portal (opendata.cern.ch).

The portal indexes particle-physics datasets, software, and documentation \
from experiments like CMS, ATLAS, ALICE and LHCb. Its search engine matches \
on simple keywords, not full sentences.

Respond with ONLY a JSON object of this exact shape:
{"search_terms": "<short keyword query, 1-6 words>", "size": <int 3-15>}

Rules:
- Strip filler words like "fetch me", "find", "best", "top", "dataset on".
- Keep physics terms as-is (proton, muon, Higgs, CMS, ATLAS, TeV, Run2, ...).
- "size" is how many results the user seems to want; default to 8 if unclear.
"""


def extract_query(user_message: str, model: Optional[str] = None) -> dict:
    """Best-effort NL -> search-terms extraction. Falls back to the raw
    message if the model output is unusable."""
    try:
        data = _chat_json(EXTRACT_SYSTEM_PROMPT, user_message, model=model)
    except OllamaUnavailable:
        raise

    search_terms = (data.get("search_terms") or "").strip()
    if not search_terms:
        search_terms = user_message.strip()

    size = data.get("size")
    if not isinstance(size, int) or not (1 <= size <= 25):
        size = 8

    return {"search_terms": search_terms, "size": size}


RANK_SYSTEM_PROMPT = """You are helping a physicist pick the most relevant \
CERN Open Data records for their request.

You will be given the user's original request and a JSON list of candidate \
records (each with a recid, title, experiment, type, and abstract snippet).

Respond with ONLY a JSON object of this exact shape:
{"ranked": [{"recid": <id>, "relevance": <0-100 int>, "why": "<one short sentence>"}, ...]}

Rules:
- Include every recid you were given, ordered from most to least relevant.
- "why" must be a single plain sentence grounded in the given title/abstract,
  not a guess about content you weren't shown.
- Do not invent recids that weren't given to you.
"""


def annotate_results(
    user_message: str, records: list[dict], model: Optional[str] = None
) -> dict[Any, dict]:
    """Ask the model to rank + explain relevance for a batch of already-
    fetched records. Returns a dict keyed by recid -> {relevance, why}."""
    candidates = [
        {
            "recid": r["recid"],
            "title": r["title"],
            "experiment": r["experiment"],
            "type": r["type"],
            "abstract": r["abstract"][:300],
        }
        for r in records
    ]
    user_payload = json.dumps(
        {"request": user_message, "candidates": candidates}, ensure_ascii=False
    )

    data = _chat_json(RANK_SYSTEM_PROMPT, user_payload, model=model)
    out: dict[Any, dict] = {}
    for item in data.get("ranked", []):
        recid = item.get("recid")
        if recid is None:
            continue
        out[recid] = {
            "relevance": item.get("relevance", 0),
            "why": item.get("why", ""),
        }
    return out


ROUTE_SYSTEM_PROMPT = """You route a user's message to the right tool of the \
CERN Data Assistant.

Two tools:
- "search": the user wants to FIND or DISCOVER datasets / data / files (e.g.
  "proton-proton collisions at 13 TeV with muons", "ATLAS Higgs data",
  "give me CMS muon datasets").
- "ask": the user asks a QUESTION about physics, experiments, detectors,
  sensors, or how the data/portal works (e.g. "Why does CMS use a solenoid?",
  "What is MiniAOD?", "How do I download a record?").

Respond with ONLY a JSON object of this exact shape:
{"intent": "search" | "ask", "confidence": <0-100 int>}

If it is clearly a request for data, choose "search". If it is a question to be
explained, choose "ask". When unsure, prefer "ask"."""


def classify_intent(user_message: str, model: Optional[str] = None) -> dict:
    """Decide whether a message should hit dataset search or the RAG Q&A.
    Falls back to a keyword heuristic if the model output is unusable."""
    try:
        data = _chat_json(ROUTE_SYSTEM_PROMPT, user_message, model=model)
        intent = data.get("intent")
        if intent in ("search", "ask"):
            conf = data.get("confidence")
            conf = conf if isinstance(conf, int) and 0 <= conf <= 100 else 60
            return {"intent": intent, "confidence": conf}
    except OllamaUnavailable:
        pass
    return {"intent": _heuristic_intent(user_message), "confidence": 40}


_ASK_HINTS = (
    "why", "what", "what's", "how", "explain", "difference", "who", "when",
    "which", "does", "do ", "is ", "are ", "?",
)
_SEARCH_HINTS = (
    "dataset", "datasets", "data ", "download", "find", "fetch", "give me",
    "records", "files", "collisions",
)


def _heuristic_intent(msg: str) -> str:
    m = msg.lower().strip()
    if any(h in m for h in _SEARCH_HINTS):
        return "search"
    if any(m.startswith(h) or f" {h}" in m for h in _ASK_HINTS):
        return "ask"
    return "ask"


# ---------------------------------------------------------------------------
# Phase 2 — embeddings + grounded (RAG) answering
# ---------------------------------------------------------------------------

def _embed_request(inputs: list[str], model: Optional[str] = None) -> list[list[float]]:
    """POST /api/embed (batched endpoint, Ollama >= 0.3)."""
    payload = {"model": model or EMBED_MODEL, "input": inputs, "keep_alive": -1}
    try:
        resp = requests.post(f"{OLLAMA_HOST}/api/embed", json=payload, timeout=EMBED_TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise OllamaUnavailable(str(exc)) from exc
    vecs = resp.json().get("embeddings")
    if not isinstance(vecs, list) or len(vecs) != len(inputs):
        raise OllamaUnavailable("embedding response malformed")
    return vecs


def embed(text: str, model: Optional[str] = None) -> list[float]:
    """Embed one QUERY string (uses the nomic query prefix)."""
    return _embed_request([EMBED_QUERY_PREFIX + text], model=model)[0]


def embed_batch(texts: list[str], model: Optional[str] = None,
                batch_size: int = 64) -> list[list[float]]:
    """Embed DOCUMENT chunks for the index, in batches (nomic document prefix)."""
    out: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = [EMBED_DOC_PREFIX + t for t in texts[i:i + batch_size]]
        out.extend(_embed_request(batch, model=model))
    return out


ASK_SYSTEM_PROMPT = """You are Beamline, a CERN Open Data briefing writer.

Write for a busy physicist: scannable, calm, professional. Not a lecture. \
Not a chatbot paragraph.

Use ONLY the numbered passages. Do not invent numbers, dates, or mechanisms.

If the passages cannot answer, reply with exactly: NOT_IN_SOURCES

OUTPUT FORMAT (plain text, this shape only):

TAKEAWAY: <one sentence, max 28 words> [n]

- <fact, max 18 words> [n]
- <fact, max 18 words> [n]
- <fact, max 18 words> [n]

Optional — add METRICS only when the passages give real numbers (tesla, TeV, km, years, sizes):

METRICS
<label> | <value> | [n]
<label> | <value> | [n]

Optional — add COMPARE only when the question contrasts two things AND both appear in the passages:

COMPARE
<name A> | <one fact> | [n]
<name B> | <one fact> | [n]

Rules:
- 3 to 5 bullets. No extra paragraphs after the bullets.
- Every TAKEAWAY, bullet, metric row, and compare row MUST end with [n] or [n][m] using only passage numbers that exist.
- No markdown headings, no JSON, no bold, no preamble ("Sure", "Here is").
- Do not repeat the same fact in TAKEAWAY and a bullet.
"""

NOT_IN_SOURCES = "NOT_IN_SOURCES"


def answer_with_context(
    question: str, passages: list[dict], model: Optional[str] = None
) -> str:
    """Given retrieved passages (each {n, title, text, ...}), return the model's
    plain-text answer with inline [n] citations, or NOT_IN_SOURCES.
    Citation verification is done server-side in guardrail.py, never trusted
    from the model."""
    context_lines = []
    for p in passages:
        label = " / ".join(x for x in (p.get("experiment"), p.get("title"), p.get("section")) if x)
        context_lines.append(f"[{p['n']}] ({label})\n{p.get('text', '')}")
    user_payload = "Passages:\n" + "\n\n".join(context_lines) + f"\n\nQuestion: {question}"
    return chat_text(ASK_SYSTEM_PROMPT, user_payload, model=model)


# ---------------------------------------------------------------------------
# Phase 4 — agentic planner (decompose a request into tool calls)
# ---------------------------------------------------------------------------

PLAN_SYSTEM_PROMPT = """You are the planner for the CERN Data Assistant. You \
turn one user message into a plan over TWO tools, and may use one, the other, \
or BOTH in a single turn.

Tools:
- "search_query": a short keyword query for the CERN Open Data portal, used to
  FIND datasets/files (e.g. "CMS muon proton collisions 13 TeV"). null if the
  user isn't asking to find data.
- "ask_query": a self-contained QUESTION about physics / detectors / experiments
  to be answered from CERN documentation (e.g. "Why does CMS use a solenoid?").
  null if the user isn't asking to understand something.

Use BOTH when the message has two parts, e.g. "find CMS muon datasets and
explain why CMS uses a solenoid" -> search_query for the data, ask_query for
the explanation.

If you are given a conversation, resolve follow-ups ("that one", "and ATLAS?",
"how do I download it?") into a self-contained search_query and/or ask_query.
Never leave pronouns unresolved.

Respond with ONLY a JSON object of this exact shape:
{"goal": "<one short sentence restating the user's goal>",
 "search_query": "<keywords>" | null,
 "ask_query": "<question>" | null}

If both would be null, put the user's message in ask_query."""


def plan_tasks(
    user_message: str,
    model: Optional[str] = None,
    history: Optional[list] = None,
) -> dict:
    """Decompose a request into optional search + ask sub-tasks. Falls back to
    the single-intent router if planning fails. `history` is prior turns
    [{role, content}] so follow-ups resolve against the conversation."""
    payload = user_message
    if history:
        lines = []
        for turn in history[-6:]:
            if not isinstance(turn, dict):
                continue
            role = turn.get("role")
            content = (turn.get("content") or "").strip()[:500]
            if role in ("user", "assistant") and content:
                lines.append(f"{role}: {content}")
        if lines:
            payload = (
                "Conversation so far:\n"
                + "\n".join(lines)
                + "\n\nLatest user message:\n"
                + user_message
            )
    try:
        data = _chat_json(PLAN_SYSTEM_PROMPT, payload, model=model)
    except OllamaUnavailable:
        data = {}

    def _clean(v):
        if isinstance(v, str) and v.strip() and v.strip().lower() != "null":
            return v.strip()
        return None

    search_q = _clean(data.get("search_query"))
    ask_q = _clean(data.get("ask_query"))
    goal = _clean(data.get("goal"))

    # Fallback: if the planner gave us nothing usable, route with the classifier.
    if not search_q and not ask_q:
        intent = classify_intent(user_message, model=model)["intent"]
        if intent == "search":
            search_q = user_message
        else:
            ask_q = user_message

    return {"goal": goal or user_message, "search_query": search_q, "ask_query": ask_q}


# ---------------------------------------------------------------------------
# Phase 3 — grounding verification (LLM fact-check rail)
# ---------------------------------------------------------------------------

GROUNDCHECK_SYSTEM_PROMPT = """You are a strict fact-checker for the CERN Data \
Assistant. You are given an ANSWER and the numbered CONTEXT passages it was \
supposed to be based on.

Decide whether EVERY factual claim in the answer is directly supported by the \
context. Do not use outside knowledge — if a claim is true in reality but is \
NOT stated in the context, it is UNSUPPORTED.

The answer may be a briefing with labels TAKEAWAY, METRICS, COMPARE, bullets, \
and pipe-separated rows. Ignore those labels and the table punctuation. Judge \
only the factual phrases.

Respond with ONLY a JSON object of this exact shape:
{"supported": <true|false>, "unsupported": ["<short quote or paraphrase of each unsupported claim>"]}

Rules:
- "supported" is true only if the context backs up all claims.
- Ignore generic framing sentences with no factual content.
- A claim that restates or paraphrases a sentence of the context IS supported, \
even if the wording differs slightly (e.g. "about" vs "roughly").
- Be strict: plausible-sounding physics that isn't in the context is unsupported."""


def verify_grounding(
    answer: str, passages: list[dict], model: Optional[str] = None
) -> dict:
    """Second-pass check: does `answer` stay within `passages`? Returns
    {"supported": bool, "unsupported": [str]}. Fails open (supported=True) only
    if the checker itself errors, so it never blocks a good answer on an
    infra hiccup — callers can treat OllamaUnavailable separately."""
    context_lines = [
        f"[{p['n']}] {p.get('title','')}\n{p.get('text','')}" for p in passages
    ]
    user_payload = f"ANSWER:\n{answer}\n\nCONTEXT:\n" + "\n\n".join(context_lines)
    # temperature 0: the verdict must be reproducible, not a coin flip
    data = _chat_json(GROUNDCHECK_SYSTEM_PROMPT, user_payload, model=model, temperature=0.0)
    if "supported" not in data:
        return {"supported": True, "unsupported": []}
    unsupported = data.get("unsupported")
    unsupported = unsupported if isinstance(unsupported, list) else []
    return {"supported": bool(data.get("supported")), "unsupported": unsupported}


# ---------------------------------------------------------------------------
# Ungrounded draft — what the GPU would say without CERN sources (demo rail)
# ---------------------------------------------------------------------------

DRAFT_SYSTEM_PROMPT = """You are a confident physicist. Answer the question in \
3-5 short sentences as if you know. Do not mention CERN, citations, retrieval, \
or that you might be guessing. Do not refuse. No headings."""


def ungrounded_draft(question: str) -> str:
    """No-RAG complete on the small fallback model. Empty string on failure.
    Never used as the product answer — only shown next to a refusal."""
    try:
        text = chat_text(
            DRAFT_SYSTEM_PROMPT,
            question,
            model=OLLAMA_FALLBACK_MODEL,
            timeout=30,
            temperature=0.7,
        )
    except OllamaUnavailable:
        return ""
    return (text or "").strip()[:900]


def draft_allowed(rail: str) -> bool:
    """Do not generate a tempting lecture for injection / unsafe prompts."""
    return bool(rail) and not rail.startswith("input:")


# ---------------------------------------------------------------------------
# Glossary anchors — which CERN glossary terms is this question about?
# ---------------------------------------------------------------------------

TERMS_SYSTEM_PROMPT = """You map a question to particle-physics vocabulary so it \
can be looked up in the CERN Open Data glossary. Reply with JSON only:
{"terms": ["...", "..."]}
List up to 6 single words or short noun phrases naming the particles, objects, \
detectors, data formats or concepts the question is about, in plain singular \
form. Example: "What is an atom made of?" -> {"terms": ["atom", "nucleus", \
"proton", "neutron", "electron", "ion"]}. Do not answer the question."""


def suggest_glossary_terms(question: str, model: Optional[str] = None) -> list[str]:
    """Up to 6 lower-case candidate terms for the glossary graph. Runs on the
    small fallback model (fast) at temperature 0. Nothing returned here is
    ever shown or used in an answer: app.py keeps only the candidates that
    exist in the CERN glossary, so the model cannot invent vocabulary."""
    try:
        data = _chat_json(TERMS_SYSTEM_PROMPT, f"Question: {question}",
                          model=model or OLLAMA_FALLBACK_MODEL, temperature=0.0)
    except OllamaUnavailable:
        return []
    terms = data.get("terms") if isinstance(data, dict) else None
    if not isinstance(terms, list):
        return []
    out: list[str] = []
    for t in terms:
        if isinstance(t, str):
            t = " ".join(t.strip().lower().split())[:40]
            if t and t not in out:
                out.append(t)
    return out[:6]
