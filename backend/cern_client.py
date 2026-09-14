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


def summarize_hit(hit: dict) -> dict:
    """Flatten one search-result hit into the RecordSummary shape the
    frontend expects."""
    recid = hit.get("id")
    md = hit.get("metadata", {}) or {}
    return {
        "recid": recid,
        "title": (_dig(md, "title") or "").strip() or f"Record {recid}",
        "experiment": _experiment_string(md),
        "type": _type_string(md),
        "subtype": _dig(md, "categories", default="") if isinstance(md.get("categories"), str) else "",
        "collision_energy": _dig(md, "collision_energy", default="—"),
        "collision_type": _dig(md, "collision_type", default="—"),
        "date_published": _dig(md, "date_published", "date_created", "date_reprocessed", default="—"),
        "file_count": _file_count(md),
        "abstract": _abstract_string(md)[:600],
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
