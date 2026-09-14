"""
cern_client.py — thin client for the CERN Open Data REST API
(https://opendata.cern.ch/), plus helpers that flatten its records into
the compact shape the frontend renders.

Adapted from a standalone `fetch_cern.py` CLI script: the same
underlying HTTP calls, refactored into importable functions and wired
to raise CernApiError (instead of printing to stderr / sys.exit) so
app.py can turn failures into clean JSON error responses.
"""

from __future__ import annotations

import os
import json
import urllib.request
import urllib.parse
from typing import Any

CERN_API_BASE = os.environ.get("CERN_API_BASE", "https://opendata.cern.ch/api/records/")
REQUEST_TIMEOUT = 30


class CernApiError(RuntimeError):
    """Raised whenever the CERN Open Data API can't be reached or
    returns something unparseable."""


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return json.loads(resp.read().decode())
    except Exception as exc:  # noqa: BLE001 - surfaced as CernApiError
        raise CernApiError(str(exc)) from exc


# ---------------------------------------------------------------------------
# Raw API calls
# ---------------------------------------------------------------------------

def search_records(query: str, page: int = 1, size: int = 10) -> dict:
    """Search opendata.cern.ch by free-text query. Returns the raw
    search envelope (dict with `hits.hits` / `hits.total`)."""
    params = urllib.parse.urlencode({"q": query, "page": page, "size": size})
    return _get_json(f"{CERN_API_BASE}?{params}")


def get_record(recid: int | str) -> dict:
    """Fetch the full metadata record for a single recid."""
    return _get_json(f"{CERN_API_BASE}{recid}")


# ---------------------------------------------------------------------------
# Flattening helpers — CERN's record schema varies a fair bit between
# experiments and record types, so every lookup below is defensive.
# ---------------------------------------------------------------------------

def _dig(md: dict, *keys, default=None):
    """Return the first present, non-empty value among the given keys."""
    for k in keys:
        v = md.get(k)
        if v not in (None, "", [], {}):
            return v
    return default


def _type_string(md: dict) -> str:
    t = md.get("type")
    if isinstance(t, dict):
        primary = t.get("primary", "")
        secondary = t.get("secondary")
        if isinstance(secondary, list) and secondary:
            return f"{primary} / {', '.join(secondary)}" if primary else ", ".join(secondary)
        return primary or "—"
    if isinstance(t, str):
        return t
    return "—"


def _abstract_string(md: dict) -> str:
    ab = md.get("abstract")
    if isinstance(ab, dict):
        return (ab.get("description") or "").strip()
    if isinstance(ab, str):
        return ab.strip()
    return ""


def _experiment_string(md: dict) -> str:
    exp = md.get("experiment")
    if isinstance(exp, list):
        return ", ".join(str(e) for e in exp)
    if isinstance(exp, str):
        return exp
    collab = md.get("collaboration")
    if isinstance(collab, dict):
        return collab.get("name", "—")
    return "—"


def _file_count(md: dict) -> int:
    files = md.get("files")
    if isinstance(files, list):
        return len(files)
    dist = md.get("distribution")
    if isinstance(dist, dict) and isinstance(dist.get("number_files"), int):
        return dist["number_files"]
    return 0


def _license_string(md: dict):
    lic = md.get("license")
    if isinstance(lic, dict):
        return lic.get("attribution") or lic.get("label") or json.dumps(lic)
    if isinstance(lic, str):
        return lic
    return None


# ---------------------------------------------------------------------------
# Phase 1 — richer dataset-card fields (size, format, DOI, citation, usage)
# ---------------------------------------------------------------------------

_SIZE_UNITS = ("B", "KB", "MB", "GB", "TB", "PB")


def _distribution(md: dict) -> dict:
    dist = md.get("distribution")
    return dist if isinstance(dist, dict) else {}


def format_size(n) -> str:
    """Human-readable byte size. Returns '—' when unknown."""
    if not isinstance(n, (int, float)) or n <= 0:
        return "—"
    size = float(n)
    for unit in _SIZE_UNITS:
        if size < 1024 or unit == _SIZE_UNITS[-1]:
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} PB"


def _size_bytes(md: dict) -> int | None:
    dist = _distribution(md)
    size = dist.get("size")
    if isinstance(size, (int, float)) and size > 0:
        return int(size)
    total = 0
    for f in md.get("files", []) or []:
        if isinstance(f, dict) and isinstance(f.get("size"), (int, float)):
            total += int(f["size"])
    return total or None


def _formats(md: dict) -> list[str]:
    dist = _distribution(md)
    fmts = dist.get("formats")
    out: list[str] = []
    if isinstance(fmts, list):
        out = [str(x).lstrip(".").lower() for x in fmts if x]
    if not out:
        seen: set[str] = set()
        for f in md.get("files", []) or []:
            if not isinstance(f, dict):
                continue
            name = f.get("key") or f.get("filename") or f.get("uri") or ""
            if "." in name:
                seen.add(name.rsplit(".", 1)[-1].lower())
        out = sorted(seen)
    # de-dupe, keep order
    deduped: list[str] = []
    for x in out:
        if x and x not in deduped:
            deduped.append(x)
    return deduped[:8]


def _doi(md: dict) -> str | None:
    doi = md.get("doi")
    if isinstance(doi, str) and doi.strip():
        return doi.strip()
    return None


def _kind(md: dict) -> str:
    """Classify the record so datasets can be told apart from glossary /
    documentation / software entries (fixes the 'atom -> glossary' case)."""
    t = md.get("type")
    primary = ""
    if isinstance(t, dict):
        primary = (t.get("primary") or "").lower()
    elif isinstance(t, str):
        primary = t.lower()
    if "dataset" in primary:
        return "Dataset"
    if primary in ("documentation", "glossary", "supplementary"):
        return "Documentation"
    if primary in ("software", "environment", "tool"):
        return "Software"
    return primary.title() if primary else "Other"


def _usage_command(recid, kind: str) -> str:
    """A copy-paste command teammates can actually run."""
    if kind == "Dataset":
        return f"cernopendata-client download-files --recid {recid}"
    return f"# see https://opendata.cern.ch/record/{recid}"


def _citation(md: dict, recid, experiment: str, date: str) -> str:
    title = (_dig(md, "title") or f"Record {recid}").strip()
    doi = _doi(md)
    year = (date or "").split("-")[0] if date and date != "—" else "n.d."
    exp = experiment if experiment and experiment != "—" else "CERN Open Data"
    base = f"{exp} ({year}). {title}. CERN Open Data Portal."
    if doi:
        return f"{base} https://doi.org/{doi}"
    return f"{base} https://opendata.cern.ch/record/{recid}"


def _downstream_suggestion(kind: str, formats: list[str], experiment: str) -> str:
    """Deterministic, honest hint about what the data is typically used for.
    (Phase 2 can replace this with an LLM/RAG-grounded suggestion.)"""
    if kind != "Dataset":
        return "Reference/documentation — use it to understand an experiment or detector, not as analysis input."
    fset = set(formats)
    exp = (experiment or "").upper()
    if "root" in fset:
        if "PHYSLITE" in exp or "physlite" in fset:
            return "Open with ATLAS analysis tools or uproot/awkward; good for event-level selection studies."
        return "Open ROOT ntuples with ROOT or Python uproot/awkward for histogramming and selection."
    if {"aod", "miniaod", "nanoaod"} & fset:
        return "Reconstructed physics objects — analyze with CMSSW or NanoAOD tools (coffea/uproot)."
    if {"csv", "json"} & fset:
        return "Tabular/structured data — load with pandas for quick exploration or ML features."
    if "txt" in fset:
        return "Text/config data — inspect directly or parse for conditions/metadata."
    return "General-purpose dataset — check the record page for the recommended analysis software."


def summarize_hit(hit: dict) -> dict:
    """Flatten one search-result hit into the RecordSummary shape the
    frontend expects."""
    recid = hit.get("id")
    md = hit.get("metadata", {}) or {}
    experiment = _experiment_string(md)
    date_published = _dig(md, "date_published", "date_created", "date_reprocessed", default="—")
    kind = _kind(md)
    size_bytes = _size_bytes(md)
    formats = _formats(md)
    return {
        "recid": recid,
        "title": (_dig(md, "title") or "").strip() or f"Record {recid}",
        "experiment": experiment,
        "type": _type_string(md),
        "kind": kind,
        "is_dataset": kind == "Dataset",
        "subtype": _dig(md, "categories", default="") if isinstance(md.get("categories"), str) else "",
        "collision_energy": _dig(md, "collision_energy", default="—"),
        "collision_type": _dig(md, "collision_type", default="—"),
        "date_published": date_published,
        "file_count": _file_count(md),
        "size_bytes": size_bytes,
        "size": format_size(size_bytes),
        "formats": formats,
        "doi": _doi(md),
        "abstract": _abstract_string(md)[:600],
        "usage": _usage_command(recid, kind),
        "suggestion": _downstream_suggestion(kind, formats, experiment),
        "citation": _citation(md, recid, experiment, date_published),
        "url": f"https://opendata.cern.ch/record/{recid}",
    }


def summarize_full_record(data: dict) -> dict:
    """Flatten a single full record (GET /api/records/<recid>) into the
    RecordDetail shape: the summary fields plus a file list and license."""
    summary = summarize_hit(data)
    md = data.get("metadata", {}) or {}

    files_out: list[dict[str, Any]] = []
    for f in md.get("files", []) or []:
        if isinstance(f, dict):
            files_out.append({
                "filename": f.get("key") or f.get("filename") or f.get("uri", "").rsplit("/", 1)[-1],
                "size": f.get("size"),
                "uri": f.get("uri"),
            })

    summary["files"] = files_out
    summary["license"] = _license_string(md)
    return summary
