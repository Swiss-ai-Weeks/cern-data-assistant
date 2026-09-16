"""Fetch and cache verbatim CERN record passages used in investigations."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import requests

RECORDS = {
    '12341': 'https://opendata.cern.ch/api/records/12341',
    '12342': 'https://opendata.cern.ch/api/records/12342',
}


def cache_dir(analysis_directory: Path) -> Path:
    path = analysis_directory / 'source_passages'
    path.mkdir(parents=True, exist_ok=True)
    return path


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def fetch_record(recid: str) -> dict:
    url = RECORDS.get(recid)
    if not url:
        raise ValueError(f'Unsupported source record {recid}.')
    response = requests.get(url, timeout=40)
    response.raise_for_status()
    record = response.json()
    metadata = record.get('metadata') or {}
    title = metadata.get('title') or f'CERN record {recid}'
    parts = []
    for key in ('abstract', 'description', 'note'):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
        elif isinstance(value, dict):
            for sub in ('description', 'value', 'text'):
                nested = value.get(sub)
                if isinstance(nested, str) and nested.strip():
                    parts.append(nested.strip())
        elif isinstance(value, list):
            parts.extend(str(item).strip() for item in value if str(item).strip())
    text = '\n\n'.join(parts).strip()
    if not text:
        text = title
    fetched_at = datetime.now(timezone.utc).isoformat()
    return {
        'id': recid,
        'title': title,
        'url': f'https://opendata.cern.ch/record/{recid}',
        'kind': 'verbatim CERN record excerpt',
        'text': text[:8000],
        'fetched_at': fetched_at,
        'sha256': _digest(text),
        'curated_summary': False,
    }


def load_or_fetch(analysis_directory: Path, recid: str, *, force: bool = False) -> dict:
    path = cache_dir(analysis_directory) / f'record-{recid}.json'
    if not force and path.exists():
        cached = json.loads(path.read_text())
        if cached.get('sha256') and cached.get('text'):
            return cached
    payload = fetch_record(recid)
    path.write_text(json.dumps(payload, indent=2))
    return payload


def bundle_cached(analysis_directory: Path) -> list[dict]:
    out = []
    for recid in RECORDS:
        path = cache_dir(analysis_directory) / f'record-{recid}.json'
        if not path.exists():
            continue
        try:
            cached = json.loads(path.read_text())
            if cached.get('text'):
                out.append(cached)
        except Exception:
            continue
    return out


def bundle(analysis_directory: Path) -> list[dict]:
    out = []
    for recid in RECORDS:
        try:
            out.append(load_or_fetch(analysis_directory, recid))
        except Exception:
            continue
    return out
