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

Glossary graph: the CERN glossary terms are nodes; edges are the portal's
"See also" links plus nearest neighbours among the glossary embeddings we
already hold. `expand_terms` walks one hop from anchor terms so a question
about "atoms" can be retried as "atoms (nucleus, proton, electron, ion)".
Used only when the retrieval gate would otherwise refuse (see app._run_ask).
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
# glossary graph: embedding neighbours per term, and the cosine they need
GRAPH_NEIGHBOR_K = 5
GRAPH_NEIGHBOR_MIN = 0.75
GRAPH_MAX_EDGES = 8
_SEE_ALSO_RE = re.compile(r"^See also:\s*(.+)$", re.MULTILINE)


class KnowledgeBase:
    """Loads the prebuilt index once and answers nearest-neighbour queries."""

    def __init__(self) -> None:
        self.vectors: Optional[np.ndarray] = None
        self.chunks: list[dict] = []
        self.term_to_idx: dict[str, int] = {}
        self.exp_masks: dict[str, np.ndarray] = {}
        self.neighbors: dict[int, list[int]] = {}  # glossary chunk -> related glossary chunks
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
        # lookup tables for the boosts. The portal stores spelling variants
        # as "Electron / electron / electrons", so every variant is a key.
        for i, c in enumerate(self.chunks):
            for variant in _term_variants(c.get("term")):
                self.term_to_idx.setdefault(variant, i)
        exps = np.array([(c.get("experiment") or "").upper() for c in self.chunks])
        for e in EXPERIMENTS:
            mask = np.char.find(exps, e.upper()) >= 0
            if mask.any():
                self.exp_masks[e.upper()] = mask
        self._build_graph()

    def _build_graph(self) -> None:
        """Glossary term graph: 'See also' edges + embedding neighbours."""
        gidx = [i for i, c in enumerate(self.chunks) if c.get("kind") == "glossary"]
        if not gidx or self.vectors is None:
            return
        edges: dict[int, list[int]] = {i: [] for i in gidx}

        def link(a: int, b: int) -> None:
            if a != b and b not in edges[a] and len(edges[a]) < GRAPH_MAX_EDGES:
                edges[a].append(b)

        # (a) curated links from the portal, both directions
        for i in gidx:
            m = _SEE_ALSO_RE.search(self.chunks[i].get("text") or "")
            if not m:
                continue
            for name in m.group(1).split(","):
                j = self.term_to_idx.get(name.strip().lower())
                if j is not None and j in edges:
                    link(i, j)
                    link(j, i)
        # (b) nearest neighbours among glossary embeddings (already normalised)
        g = np.asarray(gidx)
        sims = self.vectors[g] @ self.vectors[g].T
        np.fill_diagonal(sims, -1.0)
        top = np.argsort(sims, axis=1)[:, ::-1][:, :GRAPH_NEIGHBOR_K]
        for row, i in enumerate(gidx):
            for col in top[row]:
                if sims[row, col] < GRAPH_NEIGHBOR_MIN:
                    break
                j = int(g[col])
                link(i, j)
                link(j, i)
        self.neighbors = edges

    def term_name(self, idx: int) -> str:
        """Short display name of a glossary chunk (first spelling variant)."""
        return str(self.chunks[idx].get("term") or "").split(" / ")[0].strip()

    def expand_terms(self, anchors: list[str], limit: int = GRAPH_MAX_EDGES) -> list[str]:
        """Keep the anchors that are real glossary terms, add their one-hop
        neighbours, return display names (anchors first). Anything the
        glossary does not know is dropped, so an LLM suggestion can only
        steer retrieval towards CERN vocabulary, never invent it."""
        found: list[int] = []
        for a in anchors or []:
            a = (a or "").strip().lower()
            if not a:
                continue
            idx = self.term_to_idx.get(a)
            if idx is None and a.endswith("s"):
                idx = self.term_to_idx.get(a[:-1])
            if idx is None and not a.endswith("s"):
                idx = self.term_to_idx.get(a + "s")
            if idx is not None and idx not in found:
                found.append(idx)
        if not found:
            return []
        out = list(found)
        for idx in found:
            for j in self.neighbors.get(idx, []):
                if j not in out:
                    out.append(j)
        names: list[str] = []
        for idx in out:
            name = self.term_name(idx)
            if name and name.lower() not in {n.lower() for n in names}:
                names.append(name)
            if len(names) >= limit:
                break
        return names

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


def _term_variants(term) -> list[str]:
    """'Electron / electron / electrons' -> ['electron', 'electrons']."""
    out: list[str] = []
    for v in str(term or "").split(" / "):
        v = v.strip().lower()
        if len(v) >= 3 and v not in out:
            out.append(v)
    return out


_KB: Optional[KnowledgeBase] = None


def get_kb() -> KnowledgeBase:
    """Process-wide singleton so we load the index only once."""
    global _KB
    if _KB is None:
        _KB = KnowledgeBase()
    return _KB
