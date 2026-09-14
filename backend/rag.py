"""
rag.py — tiny local vector store for the CERN Data Assistant.

No external vector DB: the corpus is small (curated CERN docs + fetched
Open Data documentation), so we keep embeddings in a NumPy matrix and do
brute-force cosine similarity. The index is built by build_index.py and
saved next to this file; the API loads it read-only at request time.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np

KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"
VECTORS_PATH = KNOWLEDGE_DIR / "index.npy"
CHUNKS_PATH = KNOWLEDGE_DIR / "chunks.json"


class KnowledgeBase:
    """Loads the prebuilt index once and answers nearest-neighbour queries."""

    def __init__(self) -> None:
        self.vectors: Optional[np.ndarray] = None
        self.chunks: list[dict] = []
        self._load()

    def _load(self) -> None:
        if VECTORS_PATH.exists() and CHUNKS_PATH.exists():
            self.vectors = np.load(VECTORS_PATH)
            self.chunks = json.loads(CHUNKS_PATH.read_text())
            # normalise once so retrieval is a plain dot product
            norms = np.linalg.norm(self.vectors, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            self.vectors = self.vectors / norms

    @property
    def ready(self) -> bool:
        return self.vectors is not None and len(self.chunks) > 0

    @property
    def size(self) -> int:
        return len(self.chunks)

    def search(self, query_vec: list[float], k: int = 4) -> list[dict]:
        """Return the top-k chunks for a query embedding, each annotated with
        a similarity score."""
        if not self.ready:
            return []
        q = np.asarray(query_vec, dtype=np.float32)
        n = np.linalg.norm(q)
        if n == 0:
            return []
        q = q / n
        scores = self.vectors @ q  # cosine, both sides normalised
        top = np.argsort(scores)[::-1][:k]
        out = []
        for idx in top:
            chunk = dict(self.chunks[int(idx)])
            chunk["score"] = float(scores[int(idx)])
            out.append(chunk)
        return out


_KB: Optional[KnowledgeBase] = None


def get_kb() -> KnowledgeBase:
    """Process-wide singleton so we load the index only once."""
    global _KB
    if _KB is None:
        _KB = KnowledgeBase()
    return _KB
