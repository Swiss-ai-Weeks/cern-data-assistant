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
import logging
from typing import Any, Optional

import requests

log = logging.getLogger("ollama_client")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gpt-oss:120b-cloud")
EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
REQUEST_TIMEOUT = 60
EMBED_TIMEOUT = 120  # first call cold-loads the model on the GPU


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


def _chat_json(system: str, user: str, model: Optional[str] = None) -> dict:
    """Call Ollama's chat endpoint in JSON mode and parse the result."""
    payload = {
        "model": model or OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.2},
    }
    try:
        resp = requests.post(
            f"{OLLAMA_HOST}/api/chat", json=payload, timeout=REQUEST_TIMEOUT
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise OllamaUnavailable(str(exc)) from exc

    content = resp.json().get("message", {}).get("content", "{}")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        log.warning("Ollama returned non-JSON content: %r", content)
        return {}


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

def embed(text: str, model: Optional[str] = None) -> list[float]:
    """Return an embedding vector for one piece of text."""
    payload = {"model": model or EMBED_MODEL, "prompt": text}
    try:
        resp = requests.post(
            f"{OLLAMA_HOST}/api/embeddings", json=payload, timeout=EMBED_TIMEOUT
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise OllamaUnavailable(str(exc)) from exc
    vec = resp.json().get("embedding")
    if not isinstance(vec, list) or not vec:
        raise OllamaUnavailable("empty embedding returned")
    return vec


def embed_batch(texts: list[str], model: Optional[str] = None) -> list[list[float]]:
    """Embed a list of texts (sequentially; the GPU makes this fast enough
    for a hackathon-sized corpus)."""
    return [embed(t, model=model) for t in texts]


ASK_SYSTEM_PROMPT = """You are the CERN Data Assistant. Answer questions about \
CERN experiments, detectors, sensors, and open data using ONLY the numbered \
CONTEXT passages provided.

Rules:
- Ground every claim in the context. Cite sources inline as [1], [2], matching
  the passage numbers you used.
- If the context does not contain the answer, say you don't have a CERN source
  for that and suggest what to look for. Do NOT invent physics.
- Be concise and precise. Prefer 2-5 sentences.

Respond with ONLY a JSON object of this exact shape:
{"answer": "<text with inline [n] citations>", "used": [<passage numbers you cited>], "grounded": <true|false>}
"""


def answer_with_context(
    question: str, passages: list[dict], model: Optional[str] = None
) -> dict:
    """Given retrieved passages (each {n, title, text, source}), produce a
    grounded answer with inline citations. `grounded` is False when the model
    could not support the answer from the context."""
    context_lines = []
    for p in passages:
        context_lines.append(
            f"[{p['n']}] {p.get('title','')}\n{p.get('text','')}\nSOURCE: {p.get('source','')}"
        )
    user_payload = (
        f"QUESTION:\n{question}\n\nCONTEXT:\n" + "\n\n".join(context_lines)
    )
    data = _chat_json(ASK_SYSTEM_PROMPT, user_payload, model=model)
    answer = (data.get("answer") or "").strip()
    used = data.get("used") if isinstance(data.get("used"), list) else []
    grounded = bool(data.get("grounded", bool(answer and used)))
    return {"answer": answer, "used": used, "grounded": grounded}


# ---------------------------------------------------------------------------
# Phase 3 — grounding verification (fact-check rail)
# ---------------------------------------------------------------------------

GROUNDCHECK_SYSTEM_PROMPT = """You are a strict fact-checker for the CERN Data \
Assistant. You are given an ANSWER and the numbered CONTEXT passages it was \
supposed to be based on.

Decide whether EVERY factual claim in the answer is directly supported by the \
context. Do not use outside knowledge — if a claim is true in reality but is \
NOT stated in the context, it is UNSUPPORTED.

Respond with ONLY a JSON object of this exact shape:
{"supported": <true|false>, "unsupported": ["<short quote or paraphrase of each unsupported claim>"]}

Rules:
- "supported" is true only if the context backs up all claims.
- Ignore generic framing sentences with no factual content.
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
    data = _chat_json(GROUNDCHECK_SYSTEM_PROMPT, user_payload, model=model)
    if "supported" not in data:
        return {"supported": True, "unsupported": []}
    unsupported = data.get("unsupported")
    unsupported = unsupported if isinstance(unsupported, list) else []
    return {"supported": bool(data.get("supported")), "unsupported": unsupported}
