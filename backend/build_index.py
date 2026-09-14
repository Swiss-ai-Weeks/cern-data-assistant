#!/usr/bin/env python3
"""
build_index.py — build the RAG knowledge index for the CERN Data Assistant.

Corpus =
  1. curated authoritative facts in knowledge/seed.json (detectors, LHC, ...)
  2. optionally, "Documentation"-type records fetched live from the CERN
     Open Data API (--with-cern).

Each source text is chunked, embedded with the Ollama embedding model
(running on the LaunchPad H100, reached via the SSH tunnel on
localhost:11434), and saved as:
  knowledge/index.npy    -> float32 matrix [n_chunks, dim]
  knowledge/chunks.json  -> [{id, title, text, source}]

Usage:
    source .venv/bin/activate
    python build_index.py                 # seed corpus only
    python build_index.py --with-cern     # + CERN documentation records
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

import cern_client
import ollama_client

KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"
SEED_PATH = KNOWLEDGE_DIR / "seed.json"
VECTORS_PATH = KNOWLEDGE_DIR / "index.npy"
CHUNKS_PATH = KNOWLEDGE_DIR / "chunks.json"

CHUNK_CHARS = 900
CHUNK_OVERLAP = 150


def chunk_text(text: str) -> list[str]:
    text = " ".join((text or "").split())
    if len(text) <= CHUNK_CHARS:
        return [text] if text else []
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_CHARS, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = end - CHUNK_OVERLAP
    return chunks


def load_seed() -> list[dict]:
    if not SEED_PATH.exists():
        return []
    return json.loads(SEED_PATH.read_text())


def fetch_cern_docs(max_records: int = 40) -> list[dict]:
    """Pull Documentation-type records from CERN Open Data as extra context."""
    out: list[dict] = []
    try:
        raw = cern_client.search_records("documentation", size=max_records)
    except cern_client.CernApiError as exc:
        print(f"WARN: could not fetch CERN docs: {exc}", file=sys.stderr)
        return out
    for hit in raw.get("hits", {}).get("hits", []):
        md = hit.get("metadata", {}) or {}
        recid = hit.get("id")
        title = (md.get("title") or "").strip()
        abstract = md.get("abstract")
        if isinstance(abstract, dict):
            abstract = abstract.get("description", "")
        body = " ".join(str(x) for x in (title, abstract) if x).strip()
        if len(body) < 40:
            continue
        out.append({
            "title": title or f"CERN record {recid}",
            "text": body,
            "source": f"https://opendata.cern.ch/record/{recid}",
        })
    return out


def build(with_cern: bool) -> None:
    docs = load_seed()
    print(f"seed docs: {len(docs)}")
    if with_cern:
        cern_docs = fetch_cern_docs()
        print(f"cern docs: {len(cern_docs)}")
        docs += cern_docs

    chunks: list[dict] = []
    for doc in docs:
        for piece in chunk_text(doc["text"]):
            chunks.append({
                "id": len(chunks),
                "title": doc.get("title", ""),
                "text": piece,
                "source": doc.get("source", ""),
            })

    if not chunks:
        print("ERROR: no chunks to index", file=sys.stderr)
        sys.exit(1)

    print(f"embedding {len(chunks)} chunks with {ollama_client.EMBED_MODEL} ...")
    try:
        vectors = ollama_client.embed_batch([c["text"] for c in chunks])
    except ollama_client.OllamaUnavailable as exc:
        print(f"ERROR: embeddings unavailable ({exc}). Is the H100 tunnel up "
              f"on {ollama_client.OLLAMA_HOST}?", file=sys.stderr)
        sys.exit(1)

    mat = np.asarray(vectors, dtype=np.float32)
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    np.save(VECTORS_PATH, mat)
    CHUNKS_PATH.write_text(json.dumps(chunks, ensure_ascii=False, indent=2))
    print(f"saved {mat.shape[0]} vectors (dim {mat.shape[1]}) -> {VECTORS_PATH.name}")
    print(f"saved chunks -> {CHUNKS_PATH.name}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build the CERN RAG index")
    ap.add_argument("--with-cern", action="store_true",
                    help="also fetch Documentation records from CERN Open Data")
    args = ap.parse_args()
    build(with_cern=args.with_cern)
