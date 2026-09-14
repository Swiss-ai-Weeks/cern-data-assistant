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
REQUEST_TIMEOUT = 60


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
