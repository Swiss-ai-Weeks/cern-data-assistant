"""
guardrails.py — Phase 3 grounding + safety rails for the CERN Data Assistant.

Three deterministic rails wrap the RAG flow so the assistant never makes
unsupported scientific claims and stays on-scope:

  1. INPUT rail    — block unsafe / prompt-injection messages before any model
                     call (`screen_query`).
  2. RETRIEVAL rail — "no CERN source → no answer": if the best retrieved
                     passage is below a similarity floor, refuse instead of
                     letting the model improvise (`retrieval_supported`).
  3. CITATION rail  — keep only citations that point at passages actually
                     retrieved AND relevant enough to cite
                     (`valid_citations`).

The heavy grounding check (does the answer stay within the passages?) is an
LLM fact-check pass in `ollama_client.verify_grounding`; app.py combines it
with these rails.
"""

from __future__ import annotations

import os
import re

# Similarity floors (cosine). Calibrated against nomic-embed-text on the seed
# corpus: on-topic top hits ~0.6-0.75, off-topic ~0.40-0.42. Tunable via env.
MIN_TOP_SCORE = float(os.environ.get("RAG_MIN_SCORE", "0.45"))
MIN_CITE_SCORE = float(os.environ.get("RAG_MIN_CITE_SCORE", "0.45"))

# Messages returned to the user for each refusal reason.
NO_SOURCE_MESSAGE = (
    "I don't have an authoritative CERN source that covers that, so I won't "
    "guess. Try rephrasing toward CERN experiments, detectors, or open data — "
    "or browse the portal at https://opendata.cern.ch."
)
UNSUPPORTED_MESSAGE = (
    "I couldn't ground a reliable answer to that in my CERN sources without "
    "risking an unsupported claim, so I'm holding back. Try narrowing the "
    "question to a specific experiment, detector, or dataset."
)
OFF_SCOPE_MESSAGE = (
    "I'm the CERN Data Assistant — I only help with CERN experiments, "
    "detectors, sensors, and open data. Ask me something in that space."
)
UNSAFE_MESSAGE = (
    "I can't help with that request. I'm limited to questions about CERN "
    "experiments, detectors, and open data."
)

# Clearly out-of-bounds / unsafe intent (kept small and high-precision).
_UNSAFE_PATTERNS = re.compile(
    r"\b("
    r"build (a|an) (bomb|weapon|explosive)|make (a )?(bomb|explosive|meth)|"
    r"how to (kill|hack|poison)|malware|ransomware|child|"
    r"credit card number|social security number"
    r")\b",
    re.IGNORECASE,
)

# Prompt-injection attempts.
_INJECTION_PATTERNS = re.compile(
    r"(ignore (all )?(previous|prior|above) (instructions|prompts?)|"
    r"disregard (the )?(above|previous|system)|"
    r"you are now|forget (your|the) (rules|instructions)|"
    r"reveal (your |the )?(system )?prompt|print your instructions)",
    re.IGNORECASE,
)

_CITATION_RE = re.compile(r"\[(\d+)\]")


def screen_query(query: str) -> dict | None:
    """Input rail. Returns None if the message is allowed, otherwise a refusal
    payload describing why (category is machine-readable for the UI/logs)."""
    q = (query or "").strip()
    if not q:
        return None
    if _UNSAFE_PATTERNS.search(q):
        return {"category": "unsafe", "message": UNSAFE_MESSAGE}
    if _INJECTION_PATTERNS.search(q):
        return {"category": "injection", "message": OFF_SCOPE_MESSAGE}
    return None


def retrieval_supported(hits: list[dict]) -> bool:
    """Retrieval rail. True only if the best passage clears the similarity
    floor — i.e. we actually have a CERN source worth answering from."""
    if not hits:
        return False
    return max(h.get("score", 0.0) for h in hits) >= MIN_TOP_SCORE


def valid_citations(answer: str, used: list, passages: list[dict]) -> list[int]:
    """Citation rail. Keep only citation numbers that (a) the model listed OR
    wrote inline as [n], (b) map to a real passage, and (c) point at a passage
    relevant enough to cite. Returns the cleaned, sorted list."""
    by_n = {p["n"]: p for p in passages}
    inline = {int(m) for m in _CITATION_RE.findall(answer or "")}
    listed = {int(n) for n in (used or []) if isinstance(n, (int, str)) and str(n).isdigit()}
    candidates = (inline | listed) or listed

    good = {
        n
        for n in candidates
        if n in by_n and by_n[n].get("score", 0.0) >= MIN_CITE_SCORE
    }
    return sorted(good)
