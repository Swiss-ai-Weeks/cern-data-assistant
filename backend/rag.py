"""
rag.py — tiny local vector store for the CERN Data Assistant.

No external vector DB: the corpus is small (curated seed facts + CERN Open
Data documentation + the CERN glossary, a few thousand chunks), so we keep
embeddings in a NumPy matrix and do brute-force cosine similarity. The index
is built by build_index.py and saved next to this file; the API loads it
read-only at request time.

Retrieval = cosine similarity + two cheap boosts (an exact glossary-term hit
and a mentioned experiment), then at most 2 chunks per source record so the
LLM sees breadth rather than five slices of one page.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

import numpy as np

KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"
VECTORS_PATH = KNOWLEDGE_DIR / "index.npy"
CHUNKS_PATH = KNOWLEDGE_DIR / "chunks.json"

EXPERIMENTS = ("CMS", "ATLAS", "ALICE", "LHCb", "TOTEM", "OPERA", "DELPHI", "JADE")
GLOSSARY_BOOST = 0.10
EXPERIMENT_BOOST = 0.03
MAX_PER_RECORD = 2
CANDIDATES = 30


class KnowledgeBase:
    """Loads the prebuilt index once and answers nearest-neighbour queries."""

    def __init__(self) -> None:
        self.vectors: Optional[np.ndarray] = None
        self.chunks: list[dict] = []
        self.term_to_idx: dict[str, int] = {}
        self.exp_masks: dict[str, np.ndarray] = {}
        self._load()

    def _load(self) -> None:
        if not (VECTORS_PATH.exists() and CHUNKS_PATH.exists()):
            return
        self.vectors = np.load(VECTORS_PATH).astype(np.float32)
        self.chunks = json.loads(CHUNKS_PATH.read_text())
        # normalise once so retrieval is a plain dot product
        norms = np.linalg.norm(self.vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self.vectors = self.vectors / norms
        # lookup tables for the boosts
        for i, c in enumerate(self.chunks):
            term = (c.get("term") or "").strip().lower()
            if term and len(term) >= 3 and term not in self.term_to_idx:
                self.term_to_idx[term] = i
        exps = np.array([(c.get("experiment") or "").upper() for c in self.chunks])
        for e in EXPERIMENTS:
            mask = np.char.find(exps, e.upper()) >= 0
            if mask.any():
                self.exp_masks[e.upper()] = mask

    @property
    def ready(self) -> bool:
        return self.vectors is not None and len(self.chunks) > 0

    @property
    def size(self) -> int:
        return len(self.chunks)

    def search(self, query_vec: list[float], k: int = 4,
               query_text: str = "") -> list[dict]:
        """Return the top-k chunks for a query embedding. Each chunk carries
        `score` (boosted, used for ranking) and `score_raw` (pure cosine,
        used by the guardrail threshold)."""
        if not self.ready:
            return []
        q = np.asarray(query_vec, dtype=np.float32)
        n = np.linalg.norm(q)
        if n == 0:
            return []
        q = q / n
        raw = self.vectors @ q  # cosine, both sides normalised
        scores = raw.copy()

        ql = (query_text or "").lower()
        if ql:
            for term, idx in self.term_to_idx.items():
                if re.search(rf"\b{re.escape(term)}\b", ql):
                    scores[idx] += GLOSSARY_BOOST
            for e, mask in self.exp_masks.items():
                if re.search(rf"\b{re.escape(e)}\b", ql, re.IGNORECASE):
                    scores[mask] += EXPERIMENT_BOOST

        order = np.argsort(scores)[::-1][:CANDIDATES]
        out: list[dict] = []
        per_record: dict[str, int] = {}
        for idx in order:
            chunk = self.chunks[int(idx)]
            rec = str(chunk.get("recid") or chunk.get("source") or idx)
            if per_record.get(rec, 0) >= MAX_PER_RECORD:
                continue
            per_record[rec] = per_record.get(rec, 0) + 1
            hit = dict(chunk)
            hit["score"] = float(scores[int(idx)])
            hit["score_raw"] = float(raw[int(idx)])
            out.append(hit)
            if len(out) >= k:
                break
        return out


_KB: Optional[KnowledgeBase] = None


def get_kb() -> KnowledgeBase:
    """Process-wide singleton so we load the index only once."""
    global _KB
    if _KB is None:
        _KB = KnowledgeBase()
    return _KB
