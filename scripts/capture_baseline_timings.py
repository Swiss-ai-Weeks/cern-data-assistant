#!/usr/bin/env python3
"""Capture investigation compute timings into backend/analysis/baseline_timings.json."""
from __future__ import annotations

import hashlib
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib import request as urlrequest

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


def _percentile(values: list[int], pct: int) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((pct / 100) * (len(ordered) - 1))))
    return ordered[index]


def _live_capture(base_url: str, count: int) -> dict:
    base_url = base_url.rstrip('/')
    with urlrequest.urlopen(f'{base_url}/api/investigations/status', timeout=20) as response:
        status = json.load(response)
    if not status.get('ready'):
        raise RuntimeError(status.get('message') or 'Live investigation sample is not ready.')

    # Fractional pT values avoid colliding with normal slider-generated runs, so the
    # measurement exercises fresh computation rather than the deterministic cache.
    nonce = (time.time_ns() % 800_000) / 1_000_000
    specs = [
        {**DEFAULT_SPEC, 'min_pt': round(2.1 + nonce + i * 3.7, 6), 'max_abs_eta': 2.4}
        for i in range(count)
    ]
    runs = []
    wall_values = []
    started = time.monotonic()
    for spec in specs:
        body = json.dumps({'spec': spec}).encode()
        req = urlrequest.Request(
            f'{base_url}/api/investigations/runs', data=body,
            headers={'Content-Type': 'application/json'}, method='POST',
        )
        run_started = time.monotonic()
        with urlrequest.urlopen(req, timeout=30) as response:
            run = json.load(response)
        wall_ms = round((time.monotonic() - run_started) * 1000)
        if run.get('cached'):
            raise RuntimeError(f"Expected a fresh live run, but {run.get('id')} was cached.")
        wall_values.append(wall_ms)
        runs.append({
            'run_id': run['id'], 'compute_ms': run['compute_ms'], 'wall_ms': wall_ms,
            'selected_events': run['selected_events'], 'spec': run['spec'],
        })
    compute_values = [int(item['compute_ms']) for item in runs]
    fresh = {
        'count': len(compute_values), 'p50': _percentile(compute_values, 50),
        'p95': _percentile(compute_values, 95), 'max': max(compute_values),
    }
    return {
        'captured_at': datetime.now(timezone.utc).isoformat(),
        'method': 'live_api_staged_sample',
        'run_samples': len(runs),
        'sample': {
            'sample_id': status['manifest'].get('sample_id'),
            'sha256': status['manifest']['sha256'],
            'entries_read': status['manifest']['entries_read'],
            'record_id': status['manifest'].get('record_id'),
        },
        'fresh_compute_ms': fresh,
        'request_wall_ms': {
            'count': len(wall_values), 'p50': _percentile(wall_values, 50),
            'p95': _percentile(wall_values, 95), 'max': max(wall_values),
        },
        'runs': runs,
        'capture_wall_ms': round((time.monotonic() - started) * 1000),
    }


def main() -> int:
    import tempfile

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', help='Running Beamline origin; captures the staged live sample.')
    parser.add_argument('--samples', type=int, default=3, choices=range(3, 11), metavar='3-10')
    parser.add_argument('--output', help='Output JSON path (defaults to the tracked release timing artifact).')
    args = parser.parse_args()
    out = Path(args.output).resolve() if args.output else BACKEND / 'analysis' / 'baseline_timings.json'

    targets = _product_targets()
    if args.base_url:
        try:
            payload = _live_capture(args.base_url, args.samples)
        except Exception as exc:
            print(f'Live timing capture failed: {exc}', file=sys.stderr)
            return 1
        payload['product_targets'] = targets
        payload['product_gates'] = _product_gates(payload['fresh_compute_ms'], targets)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
        print(f'Wrote {out}')
        print(json.dumps(payload, indent=2))
        return 0

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
    payload = {
        'captured_at': datetime.now(timezone.utc).isoformat(),
        'method': 'flask_test_client_bounded_npz',
        'run_samples': len(specs),
        'fresh_compute_ms': fresh,
        'product_targets': targets,
        'product_gates': _product_gates(fresh, targets),
        'capture_wall_ms': round((time.monotonic() - started) * 1000),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {out}')
    print(json.dumps(payload['product_gates'], indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
