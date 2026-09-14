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
import re
import json
import copy
import urllib.request
import urllib.parse
from typing import Any

from cache import TTLCache

CERN_API_BASE = os.environ.get("CERN_API_BASE", "https://opendata.cern.ch/api/records/")
REQUEST_TIMEOUT = 30
SEARCH_CACHE = TTLCache(ttl=float(os.environ.get("CERN_CACHE_TTL", "300")), maxsize=128)
RECORD_CACHE = TTLCache(ttl=float(os.environ.get("CERN_CACHE_TTL", "300")), maxsize=256)


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

# Facet query parameters the portal's search API honours (verified against
# its own aggregations; `subtype` is silently ignored, so it is not here).
FACET_KEYS = ("type", "experiment", "collision_energy", "collision_type")


def search_records(query: str, page: int = 1, size: int = 10,
                   facets: dict | None = None) -> dict:
    """Search opendata.cern.ch by free-text query plus optional facets
    (e.g. {"collision_energy": "13TeV", "collision_type": "pp",
    "type": "Dataset"}). Facets are exact filters applied server-side, so
    "13 TeV" no longer has to appear as a keyword in the title. Returns the
    raw search envelope (dict with `hits.hits` / `hits.total`). Cached so
    repeat demo queries don't round-trip CERN every time."""
    facets = {k: v for k, v in (facets or {}).items() if k in FACET_KEYS and v}
    key = (query, page, size, tuple(sorted(facets.items())))
    cached = SEARCH_CACHE.get(key)
    if cached is not None:
        return copy.deepcopy(cached)
    params = urllib.parse.urlencode({"q": query, "page": page, "size": size, **facets})
    data = _get_json(f"{CERN_API_BASE}?{params}")
    SEARCH_CACHE.set(key, data)
    return copy.deepcopy(data)


def get_record(recid: int | str) -> dict:
    """Fetch the full metadata record for a single recid."""
    key = str(recid)
    cached = RECORD_CACHE.get(key)
    if cached is not None:
        return copy.deepcopy(cached)
    data = _get_json(f"{CERN_API_BASE}{recid}")
    RECORD_CACHE.set(key, data)
    return copy.deepcopy(data)


def cache_stats() -> dict:
    return {"search": SEARCH_CACHE.stats(), "record": RECORD_CACHE.stats()}


def fallback_search_query(original: str) -> str | None:
    """If a specific keyword query still returns 0 hits after broadening,
    drop collision energies (13 TeV) or fall back to the experiment name."""
    stripped = re.sub(r"\b\d+(\.\d+)?\s*TeV\b", "", original or "", flags=re.I)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    if stripped and stripped.lower() != (original or "").strip().lower():
        return stripped
    for exp in ("CMS", "ATLAS", "ALICE", "LHCb"):
        if re.search(rf"\b{exp}\b", original or "", re.I):
            if exp.lower() != (original or "").strip().lower():
                return exp
    return None


# ---------------------------------------------------------------------------
# Facets: pull exact filters out of the natural-language request so they are
# sent to CERN as query parameters instead of hoping the keyword matches.
# ---------------------------------------------------------------------------

_EXPERIMENTS = ("CMS", "ATLAS", "ALICE", "LHCb", "DELPHI", "OPERA", "TOTEM", "JADE")
_ENERGY_RE = re.compile(r"\b(\d+(?:\.\d+)?)\s*TeV\b", re.I)
_COLLISION_TYPES = (  # regex -> portal facet value (most common spelling first)
    (re.compile(r"\b(proton[\s-]*proton|\bpp\b|p-p)\b", re.I), "pp"),
    (re.compile(r"\b(lead[\s-]*lead|pb[\s-]*pb|heavy[\s-]*ion)s?\b", re.I), "PbPb"),
    (re.compile(r"\b(proton[\s-]*lead|p[\s-]*pb)\b", re.I), "pPb"),
    (re.compile(r"(e\+\s*e-|electron[\s-]*positron)", re.I), "e+e-"),
)
_DATASET_WORDS = re.compile(
    r"\b(datasets?|samples?|collision data|collisions?|events|ntuples?|"
    r"AOD|MiniAOD|NanoAOD|PHYSLITE|simulated|simulation|monte carlo|\bMC\b|open data)\b", re.I)


def extract_facets(text: str) -> dict:
    """Deterministic facet extraction from a plain-language request.
    "proton-proton collisions at 13 TeV with muons" ->
    {"collision_type": "pp", "collision_energy": "13TeV", "type": "Dataset"}.
    `type=Dataset` is added whenever another facet was found or the request
    clearly asks for data, so documentation/glossary rows don't crowd out
    datasets."""
    text = text or ""
    facets: dict[str, str] = {}
    for exp in _EXPERIMENTS:
        if re.search(rf"\b{exp}\b", text, re.I):
            facets["experiment"] = exp
            break
    m = _ENERGY_RE.search(text)
    if m:
        num = m.group(1)
        num = num.rstrip("0").rstrip(".") if "." in num else num
        facets["collision_energy"] = f"{num}TeV"
    for rx, value in _COLLISION_TYPES:
        if rx.search(text):
            facets["collision_type"] = value
            break
    if facets or _DATASET_WORDS.search(text):
        facets["type"] = "Dataset"
    return facets


_FACET_NOISE = re.compile(
    r"\b(collisions?|collision data|at|with|for|from|of|the|in|datasets?|data|samples?|"
    r"proton[\s-]*proton|lead[\s-]*lead|proton[\s-]*lead|heavy[\s-]*ions?|\bpp\b|pbpb|ppb)\b", re.I)


def strip_facet_terms(terms: str, facets: dict) -> str:
    """Remove from the keyword query whatever is now expressed as a facet
    (energy, collision type, experiment) plus connector words, so CERN's
    strict AND search is left with the physics keywords only."""
    out = terms or ""
    if "collision_energy" in facets:
        out = _ENERGY_RE.sub(" ", out)
        out = re.sub(r"\b\d+(?:\.\d+)?TeV\b", " ", out, flags=re.I)
    if "experiment" in facets:
        out = re.sub(rf"\b{facets['experiment']}\b", " ", out, flags=re.I)
    if "collision_type" in facets or "type" in facets:
        out = _FACET_NOISE.sub(" ", out)
    out = re.sub(r"[\s,;:]+", " ", out).strip(" -")
    # Everything the user asked for is now a facet -> filters-only search
    # (q="" is valid for the portal), never the raw sentence back.
    return out


# CMS names its collision "primary datasets" after the trigger object, so a
# physicist asking for "muons" expects /DoubleMuon and /SingleMuon records —
# which a keyword search for "muon" never returns (no tokenisation inside the
# name). Expand the keyword with those aliases and merge the pools.
KEYWORD_ALIASES = {
    "muon": ["DoubleMuon", "SingleMuon", "MuOnia"],
    "electron": ["DoubleEG", "SingleElectron", "EGamma"],
    "photon": ["SinglePhoton", "DoubleEG"],
    "jet": ["JetHT"],
    "tau": ["Tau"],
    "met": ["MET"],
    "bjet": ["BTagCSV"],
}
_SIMULATED_WORDS = re.compile(r"\b(simulated|simulation|monte[\s-]*carlo|MC|generated)\b", re.I)


def alias_queries(terms: str, limit: int = 3) -> list[str]:
    """Alias search strings for the physics keywords in `terms`
    ("muons" -> ["DoubleMuon", "SingleMuon", "MuOnia"]), at most `limit`."""
    out: list[str] = []
    for word in re.findall(r"[A-Za-z]+", terms or ""):
        base = word.lower().rstrip("s")
        for alias in KEYWORD_ALIASES.get(base, []):
            if alias not in out:
                out.append(alias)
    return out[:limit]


def prefers_simulated(user_query: str) -> bool:
    return bool(_SIMULATED_WORDS.search(user_query or ""))


def _secondary_types(hit: dict) -> set[str]:
    t = (hit.get("metadata") or {}).get("type") or {}
    sec = t.get("secondary") if isinstance(t, dict) else None
    return {str(x).lower() for x in sec} if isinstance(sec, list) else set()


def order_pool(hits: list[dict], user_query: str, keywords: str) -> list[dict]:
    """Deterministic pre-ranking of the candidate pool before the LLM sees
    it: collision data before simulated (reversed when the user asked for
    simulation), then records whose title mentions a keyword or alias,
    then human-readable titles over raw /Primary/Run.../TIER names. Stable,
    so CERN's own relevance order breaks ties."""
    words = {w.lower().rstrip("s") for w in re.findall(r"[A-Za-z]+", keywords or "") if len(w) > 2}
    aliases = {a.lower() for a in alias_queries(keywords, limit=8)}
    sim_first = prefers_simulated(user_query)

    def key(h):
        sec = _secondary_types(h)
        title = ((h.get("metadata") or {}).get("title") or "").lower()
        if sim_first:
            kind_rank = 0 if "simulated" in sec else 1
        else:
            kind_rank = 0 if "collision" in sec else (1 if "derived" in sec else 2)
        mentions = any(w in title for w in words) or any(a in title for a in aliases)
        readable = not title.startswith("/")
        return (kind_rank, 0 if mentions else 1, 0 if readable else 1)

    return sorted(hits, key=key)


def facet_ladder(facets: dict) -> list[dict]:
    """Progressively looser facet sets to try when a search returns nothing:
    full, then without collision type, then without energy, then experiment
    only, then none. `type=Dataset` is kept until the very last rung."""
    steps: list[dict] = []
    cur = dict(facets or {})
    steps.append(dict(cur))
    for key in ("collision_type", "collision_energy", "experiment"):
        if key in cur:
            cur = {k: v for k, v in cur.items() if k != key}
            steps.append(dict(cur))
    if cur:
        steps.append({})
    seen, ordered = [], []
    for st in steps:
        if st not in seen:
            seen.append(st)
            ordered.append(st)
    return ordered


def broadening_attempts(terms: str) -> list[str]:
    """Keyword ladder for CERN's strict AND search: full query, then drop
    trailing words one by one, then the first word alone."""
    words = terms.split()
    attempts = [" ".join(words[:n]) for n in range(len(words), 1, -1)]
    if words:
        attempts.append(words[0])
    seen, ordered = set(), []
    for a in attempts:
        if a and a not in seen:
            seen.add(a)
            ordered.append(a)
    return ordered or [terms]


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


def _collision_field(md: dict, key: str, legacy_key: str) -> str:
    """Energy / collision type live under `collision_information` on the
    portal ({"energy": "13TeV", "type": "pp"}); older records used flat keys."""
    info = md.get("collision_information")
    if isinstance(info, dict) and info.get(key):
        return str(info[key])
    return _dig(md, legacy_key, default="—")


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
        "collision_energy": _collision_field(md, "energy", "collision_energy"),
        "collision_type": _collision_field(md, "type", "collision_type"),
        "run_period": ", ".join(md["run_period"]) if isinstance(md.get("run_period"), list) else (md.get("run_period") or ""),
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
