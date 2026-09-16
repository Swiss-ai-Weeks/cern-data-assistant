#!/usr/bin/env python3
"""Capture investigation compute timings into backend/analysis/baseline_timings.json."""
from __future__ import annotations

import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from flask import Flask

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'backend'
sys.path.insert(0, str(BACKEND))

from analysis.recipe import DEFAULT_SPEC  # noqa: E402
from analysis.service import bp, _product_gates, _product_targets  # noqa: E402


def _client(tmp_path: Path):
    sample_file = tmp_path / 'sample-0000000000000000.npz'
    np.savez_compressed(
        sample_file,
        pt=np.array([[10.0, 12.0], [8.0, 9.0]]),
        eta=np.zeros((2, 2)),
        phi=np.array([[0.0, 3.1], [1.2, 4.0]]),
        mass=np.full((2, 2), 0.105),
        charge=np.array([[1, -1], [1, -1]]),
        entry=np.array([1, 2]),
    )
    digest = hashlib.sha256(sample_file.read_bytes()).hexdigest()
    manifest = {
        'sample_file': sample_file.name,
        'sha256': digest,
        'entries_read': 2,
        'record_url': 'https://opendata.cern.ch/record/12341',
        'record_id': 12341,
        'doi': 'capture',
        'scope': 'capture',
        'sampling': 'capture',
        'identity': 'capture',
    }
    (tmp_path / 'manifest.json').write_text(json.dumps(manifest))
    app = Flask(__name__)
    app.config['ANALYSIS_DIRECTORY'] = tmp_path
    app.register_blueprint(bp)
    return app.test_client()


def main() -> int:
    import tempfile

    specs = [
        DEFAULT_SPEC,
        {**DEFAULT_SPEC, 'min_pt': 5},
        {**DEFAULT_SPEC, 'min_pt': 12, 'max_abs_eta': 2.2},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        client = _client(Path(tmp))
        started = time.monotonic()
        for spec in specs:
            response = client.post('/api/investigations/runs', json={'spec': spec})
            if response.status_code != 200:
                print(response.get_json(), file=sys.stderr)
                return 1
        metrics = client.get('/api/investigations/metrics').get_json()
    fresh = metrics['fresh_compute_ms']
    targets = _product_targets()
    payload = {
        'captured_at': datetime.now(timezone.utc).isoformat(),
        'method': 'flask_test_client_bounded_npz',
        'run_samples': len(specs),
        'fresh_compute_ms': fresh,
        'product_targets': targets,
        'product_gates': _product_gates(fresh, targets),
        'capture_wall_ms': round((time.monotonic() - started) * 1000),
    }
    out = BACKEND / 'analysis' / 'baseline_timings.json'
    out.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {out}')
    print(json.dumps(payload['product_gates'], indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
