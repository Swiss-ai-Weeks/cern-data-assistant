"""
guardrail.py — grounding checks for the RAG answer path (Phase 3, lightweight).

The model is never trusted to judge its own grounding. Two independent checks:

  1. Retrieval gate  — if the best passage is not similar enough to the
     question, we refuse BEFORE calling the LLM (no chance to hallucinate).
  2. Citation check  — after the LLM answers, every [n] must point at a real
     passage; invalid ones are stripped, and an answer with no valid citation
     is marked ungrounded.

Both thresholds come from .env so they can be calibrated at demo time.
"""

from __future__ import annotations

import os
import re

MIN_SCORE = float(os.environ.get("RAG_MIN_SCORE", "0.65"))
# Above MIN_SCORE but below MIN_SCORE + this margin -> answer, but flag it.
LOW_CONF_MARGIN = float(os.environ.get("RAG_LOW_CONF_MARGIN", "0.05"))

REFUSAL = (
    "I couldn't find this in the CERN Open Data documentation or glossary, so I "
    "won't guess. Try rephrasing, or ask about a detector, experiment, data "
    "format or glossary term."
)

_CITE_RE = re.compile(r"\[(\d{1,3})\]")


def retrieval_gate(top_score: float) -> str:
    """Return 'ok', 'low_confidence' or 'refused' from the best raw cosine."""
    if top_score < MIN_SCORE:
        return "refused"
    if top_score < MIN_SCORE + LOW_CONF_MARGIN:
        return "low_confidence"
    return "ok"


def check_citations(answer: str, n_passages: int) -> dict:
    """Validate inline [n] citations against the passages actually shown.

    Returns {answer, cited (sorted list[int]), removed (int), status}
    where status is 'ok' | 'no_citations'.
    """
    removed = 0

    def _keep(m: re.Match) -> str:
        nonlocal removed
        n = int(m.group(1))
        if 1 <= n <= n_passages:
            return m.group(0)
        removed += 1
        return ""

    cleaned = _CITE_RE.sub(_keep, answer or "")
    cleaned = re.sub(r"[ \t]+([.,;:])", r"\1", cleaned)  # tidy " ." left by removals
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    cited = sorted({int(n) for n in _CITE_RE.findall(cleaned)})
    status = "ok" if cited else "no_citations"
    return {"answer": cleaned, "cited": cited, "removed": removed, "status": status}
