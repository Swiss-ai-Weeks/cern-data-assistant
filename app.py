#!/usr/bin/env python3
"""CERN Data Assistant HTTP API. Bind 0.0.0.0:5000 on the LaunchPad H100."""

from __future__ import annotations

import json
from pathlib import Path

from flask import Flask, jsonify, request

import fetch_cern
import search_within

ROOT = Path(__file__).resolve().parent
DEFAULT_JSON = ROOT / "dataset" / "proton_full.json"
FALLBACK_JSON = Path.home() / "nvidia_hack" / "dataset" / "proton_full.json"

app = Flask(__name__)


def _data_path() -> Path:
    if DEFAULT_JSON.exists():
        return DEFAULT_JSON
    return FALLBACK_JSON


def _load_local():
    path = _data_path()
    if not path.exists():
        return None, path
    return json.loads(path.read_text()), path


@app.get("/")
def health():
    path = _data_path()
    return jsonify({
        "ok": True,
        "service": "cern-data-assistant",
        "local_json": str(path),
        "local_json_exists": path.exists(),
        "endpoints": {
            "GET /": "health",
            "GET /search?q=proton&size=10": "live CERN Open Data search",
            "GET /record/<recid>": "full CERN record metadata",
            "GET /files?pattern=.root&ext=.root&experiment=ATLAS": "search cached files",
        },
    })


@app.get("/search")
def search():
    query = request.args.get("q") or request.args.get("query") or "proton"
    size = int(request.args.get("size", 10))
    page = int(request.args.get("page", 1))
    data = fetch_cern.search_records(query, page=page, size=size)
    if not data:
        return jsonify({"ok": False, "error": "CERN search failed"}), 502
    return jsonify(fetch_cern.summarize_hits(data, query))


@app.get("/record/<int:recid>")
def record(recid: int):
    data = fetch_cern.get_record(recid)
    if not data:
        return jsonify({"ok": False, "error": f"record {recid} not found"}), 404
    return jsonify(data)


@app.get("/files")
def files():
    data, path = _load_local()
    if data is None:
        return jsonify({
            "ok": False,
            "error": f"cached JSON not found at {path}",
            "hint": 'python fetch_cern.py search "proton" --full --save dataset/proton_full.json',
        }), 404

    min_size = search_within.parse_size(request.args.get("min_size")) if request.args.get("min_size") else None
    max_size = search_within.parse_size(request.args.get("max_size")) if request.args.get("max_size") else None
    out, _ = search_within.search_within(
        data,
        pattern=request.args.get("pattern") or "",
        ext=request.args.get("ext"),
        min_size=min_size,
        max_size=max_size,
        experiment=request.args.get("experiment"),
        regex=request.args.get("regex") in {"1", "true", "yes"},
    )
    out["source"] = str(path)
    return jsonify(out)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
