#!/usr/bin/env python3
"""
build_index.py — build the RAG knowledge index for the CERN Data Assistant.

Corpus (all three are on by default):
  1. knowledge/seed.json      curated facts with source URLs
  2. CERN Open Data "Documentation" records that carry real page text
     (detector/experiment guides, "About CMS", data-format guides, ...).
     The ~9,000 auto-generated LHCb "Stripping" pages are skipped.
  3. CERN Open Data "Glossary" records (≈1,000 terms with definitions).

Raw API pulls are cached in knowledge/raw_*.jsonl so a rebuild never waits
on opendata.cern.ch. Each source text is chunked, embedded with the Ollama
embedding model, and saved as:
  knowledge/index.npy    -> float32 matrix [n_chunks, dim]
  knowledge/chunks.json  -> [{id, recid, kind, title, section, experiment,
                              term, text, source}]

Usage:
    source .venv/bin/activate
    python build_index.py              # seed + CERN docs + glossary
    python build_index.py --seed-only  # curated facts only (quick smoke test)
    python build_index.py --force      # re-download the CERN records
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

import cern_client
import ollama_client

KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"
SEED_PATH = KNOWLEDGE_DIR / "seed.json"
RAW_DOCS_PATH = KNOWLEDGE_DIR / "raw_docs.jsonl"
RAW_GLOSSARY_PATH = KNOWLEDGE_DIR / "raw_glossary.jsonl"
VECTORS_PATH = KNOWLEDGE_DIR / "index.npy"
CHUNKS_PATH = KNOWLEDGE_DIR / "chunks.json"
META_PATH = KNOWLEDGE_DIR / "index_meta.json"

CHUNK_CHARS = 1200
CHUNK_OVERLAP = 200
MIN_CHUNK_CHARS = 80
PAGE_SIZE = 100
MAX_HITS = 10_000  # Elasticsearch max_result_window on the portal

PORTAL = "https://opendata.cern.ch"


# ---------------------------------------------------------------------------
# CERN Open Data fetch (with facet params + pagination + raw cache)
# ---------------------------------------------------------------------------

def _get(params: dict, retries: int = 3) -> dict:
    url = f"{cern_client.CERN_API_BASE}?{urllib.parse.urlencode(params)}"
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode())
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 * (attempt + 1))
    raise cern_client.CernApiError(f"{url}: {last}")


def fetch_all(record_type: str, keep=lambda hit: True) -> list[dict]:
    """Page through every record of one `type` facet."""
    out: list[dict] = []
    page = 1
    while True:
        data = _get({"q": "", "type": record_type, "size": PAGE_SIZE, "page": page})
        hits = data.get("hits", {}).get("hits", [])
        total = data.get("hits", {}).get("total", 0)
        total = total.get("value", 0) if isinstance(total, dict) else total
        out.extend(h for h in hits if keep(h))
        print(f"  {record_type}: page {page} ({len(hits)} hits, kept {len(out)} so far, total {total})",
              file=sys.stderr)
        if len(hits) < PAGE_SIZE or page * PAGE_SIZE >= min(total, MAX_HITS):
            break
        page += 1
        time.sleep(0.2)  # be polite
    return out


def _is_useful_doc(hit: dict) -> bool:
    md = hit.get("metadata", {}) or {}
    secondary = (md.get("type") or {}).get("secondary") or []
    if "Stripping" in secondary:  # ~9k auto-generated LHCb pages
        return False
    body = md.get("body")
    if isinstance(body, dict) and (body.get("content") or "").strip():
        return True
    abstract = md.get("abstract")
    if isinstance(abstract, dict):
        abstract = abstract.get("description", "")
    return isinstance(abstract, str) and len(abstract.strip()) >= 200


def _load_or_fetch(path: Path, record_type: str, keep, force: bool) -> list[dict]:
    if path.exists() and not force:
        hits = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        print(f"{record_type}: {len(hits)} records from cache {path.name}", file=sys.stderr)
    else:
        print(f"{record_type}: fetching from {PORTAL} ...", file=sys.stderr)
        hits = fetch_all(record_type, keep)
        KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(json.dumps(h, ensure_ascii=False) for h in hits) + "\n")
    # The portal paginates by relevance with ties, so a record can appear on
    # two consecutive pages. Keep the first occurrence of each id.
    seen: set[str] = set()
    unique = []
    for h in hits:
        rid = str(h.get("id"))
        if rid not in seen:
            seen.add(rid)
            unique.append(h)
    if len(unique) != len(hits):
        print(f"{record_type}: dropped {len(hits) - len(unique)} duplicate records", file=sys.stderr)
    return unique


# ---------------------------------------------------------------------------
# Record -> text -> chunks
# ---------------------------------------------------------------------------

def record_url(hit: dict, kind: str) -> str:
    md = hit.get("metadata", {}) or {}
    rid = str(hit.get("id") or md.get("recid") or "")
    if kind == "glossary":
        return f"{PORTAL}/glossary#{md.get('anchor') or rid}"
    if rid.isdigit():
        return f"{PORTAL}/record/{rid}"
    return f"{PORTAL}/docs/{rid}"  # slug ids such as "about-cms"


def _experiment(md: dict) -> str:
    exp = md.get("experiment")
    if isinstance(exp, list):
        return ", ".join(str(e) for e in exp)
    return str(exp) if exp else ""


def clean_markdown(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)        # images
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)      # links -> text
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def _split_sections(text: str, title: str) -> list[tuple[str, str]]:
    """Split markdown on headings -> [(section_title, body)]."""
    sections: list[tuple[str, str]] = []
    current, buf = title, []
    for line in text.splitlines():
        m = re.match(r"^#{1,4}\s+(.*)", line)
        if m:
            if "".join(buf).strip():
                sections.append((current, "\n".join(buf).strip()))
            current, buf = m.group(1).strip(), []
        else:
            buf.append(line)
    if "".join(buf).strip():
        sections.append((current, "\n".join(buf).strip()))
    return sections


def _window(text: str) -> list[str]:
    text = text.strip()
    if len(text) <= CHUNK_CHARS:
        return [text]
    pieces, start = [], 0
    while start < len(text):
        end = min(start + CHUNK_CHARS, len(text))
        if end < len(text):
            cut = max(text.rfind("\n", start, end), text.rfind(". ", start, end))
            if cut > start + CHUNK_CHARS // 2:
                end = cut + 1
        pieces.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - CHUNK_OVERLAP, start + 1)
    return pieces


def chunk_doc(hit: dict) -> list[dict]:
    md = hit.get("metadata", {}) or {}
    title = (md.get("title") or "").strip() or f"CERN record {hit.get('id')}"
    body = md.get("body")
    text = body.get("content", "") if isinstance(body, dict) else ""
    if not text.strip():
        abstract = md.get("abstract")
        text = abstract.get("description", "") if isinstance(abstract, dict) else (abstract or "")
    text = clean_markdown(text)
    exp = _experiment(md)
    url = record_url(hit, "doc")
    out = []
    for section, sec_body in _split_sections(text, title):
        for piece in _window(sec_body):
            if len(piece) < MIN_CHUNK_CHARS:
                continue
            head = title if section == title else f"{title} — {section}"
            out.append({
                "recid": str(hit.get("id")),
                "kind": "doc",
                "title": title,
                "section": section if section != title else "",
                "experiment": exp,
                "term": None,
                "text": f"{head}\n\n{piece}",
                "source": url,
            })
    return out


# ~850 "glossary" records are LHCb LoKi functor reference pages ("const bool
# nucleus = NUCLEUS ( p ) ; See also MCParticle ..."). They are not physics
# definitions and outrank the real entries for questions like "what is an atom
# made of", so they are left out of the knowledge base.
_LOKI_MARKERS = ("LoKi::", "const MCParticle", "const LHCb::")


def _is_loki_functor(definition: str) -> bool:
    return any(m in definition for m in _LOKI_MARKERS)


def chunk_glossary(hit: dict) -> list[dict]:
    md = hit.get("metadata", {}) or {}
    term = md.get("term") or md.get("anchor") or str(hit.get("id"))
    if isinstance(term, list):  # the portal stores term as a one-element list
        term = " / ".join(str(t) for t in term if t)
    term = str(term).strip()
    definition = md.get("definition") or ""
    if isinstance(definition, list):
        definition = " ".join(str(d) for d in definition)
    definition = clean_markdown(definition)
    if len(definition) < 20:
        return []
    if _is_loki_functor(definition):
        return []
    exp = _experiment(md)
    lines = [f"Glossary term: {term}"]
    if md.get("category"):
        lines.append(f"Category: {md['category']}")
    if exp:
        lines.append(f"Experiment: {exp}")
    lines.append("")
    lines.append(definition)
    see_also = md.get("see_also") or []
    if isinstance(see_also, list) and see_also:
        names = [s.get("term") if isinstance(s, dict) else str(s) for s in see_also]
        lines.append("See also: " + ", ".join(n for n in names if n))
    return [{
        "recid": f"glossary:{hit.get('id')}",
        "kind": "glossary",
        "title": f"Glossary: {term}",
        "section": "",
        "experiment": exp,
        "term": term,
        "text": "\n".join(lines),
        "source": record_url(hit, "glossary"),
    }]


def chunk_seed(doc: dict) -> list[dict]:
    text = " ".join((doc.get("text") or "").split())
    return [{
        "recid": f"seed:{doc.get('title', '')}",
        "kind": "seed",
        "title": doc.get("title", ""),
        "section": "",
        "experiment": doc.get("experiment", ""),
        "term": None,
        "text": f"{doc.get('title', '')}\n\n{piece}",
        "source": doc.get("source", ""),
    } for piece in _window(text) if len(piece) >= MIN_CHUNK_CHARS]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build(seed_only: bool, force: bool) -> None:
    chunks: list[dict] = []

    seed = json.loads(SEED_PATH.read_text()) if SEED_PATH.exists() else []
    for doc in seed:
        chunks += chunk_seed(doc)
    print(f"seed: {len(seed)} facts -> {len(chunks)} chunks", file=sys.stderr)

    if not seed_only:
        docs = _load_or_fetch(RAW_DOCS_PATH, "Documentation", _is_useful_doc, force)
        n0 = len(chunks)
        for hit in docs:
            chunks += chunk_doc(hit)
        by_exp = collections.Counter(_experiment(h.get("metadata", {})) or "—" for h in docs)
        print(f"docs: {len(docs)} records -> {len(chunks) - n0} chunks {dict(by_exp)}", file=sys.stderr)

        glossary = _load_or_fetch(RAW_GLOSSARY_PATH, "Glossary", lambda h: True, force)
        n0 = len(chunks)
        for hit in glossary:
            chunks += chunk_glossary(hit)
        print(f"glossary: {len(glossary)} terms -> {len(chunks) - n0} chunks", file=sys.stderr)

    # Drop exact-duplicate chunk texts (identical passages are useless to the LLM)
    seen_text: set[str] = set()
    deduped = []
    for c in chunks:
        key = " ".join(c["text"].split()).lower()
        if key not in seen_text:
            seen_text.add(key)
            deduped.append(c)
    if len(deduped) != len(chunks):
        print(f"dropped {len(chunks) - len(deduped)} duplicate chunks", file=sys.stderr)
    chunks = deduped

    if not chunks:
        print("ERROR: no chunks to index", file=sys.stderr)
        sys.exit(1)
    for i, c in enumerate(chunks):
        c["id"] = i

    print(f"embedding {len(chunks)} chunks with {ollama_client.EMBED_MODEL} "
          f"via {ollama_client.OLLAMA_HOST} ...", file=sys.stderr)
    t0 = time.time()
    try:
        vectors = ollama_client.embed_batch([c["text"] for c in chunks])
    except ollama_client.OllamaUnavailable as exc:
        print(f"ERROR: embeddings unavailable ({exc}). Is the H100 tunnel up "
              f"on {ollama_client.OLLAMA_HOST}?", file=sys.stderr)
        sys.exit(1)

    mat = np.asarray(vectors, dtype=np.float32)
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    np.save(VECTORS_PATH, mat)
    CHUNKS_PATH.write_text(json.dumps(chunks, ensure_ascii=False))
    META_PATH.write_text(json.dumps({
        "embed_model": ollama_client.EMBED_MODEL,
        "dim": int(mat.shape[1]),
        "n_chunks": int(mat.shape[0]),
        "kinds": dict(collections.Counter(c["kind"] for c in chunks)),
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, indent=2))
    print(f"saved {mat.shape[0]} vectors (dim {mat.shape[1]}) in {time.time() - t0:.1f}s "
          f"-> {VECTORS_PATH.name}, {CHUNKS_PATH.name}", file=sys.stderr)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build the CERN RAG index")
    ap.add_argument("--seed-only", action="store_true",
                    help="index only knowledge/seed.json (skip CERN docs + glossary)")
    ap.add_argument("--force", action="store_true",
                    help="re-download CERN records instead of using the raw cache")
    ap.add_argument("--with-cern", action="store_true",
                    help="(default, kept for compatibility)")
    args = ap.parse_args()
    build(seed_only=args.seed_only, force=args.force)
