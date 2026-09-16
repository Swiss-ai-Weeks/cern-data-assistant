import json
import sys
from pathlib import Path

import numpy as np
import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.recipe import DEFAULT_SPEC
from analysis.service import bp


@pytest.fixture
def client(tmp_path):
    sample_file = tmp_path / 'sample-0000000000000000.npz'
    np.savez_compressed(
        sample_file,
        pt=np.array([[10.0, 12.0]]),
        eta=np.zeros((1, 2)),
        phi=np.array([[0.0, 3.1]]),
        mass=np.full((1, 2), 0.105),
        charge=np.array([[1, -1]]),
        entry=np.array([1]),
    )
    digest = __import__('hashlib').sha256(sample_file.read_bytes()).hexdigest()
    manifest = {
        'sample_file': sample_file.name,
        'sha256': digest,
        'entries_read': 1,
        'record_url': 'https://opendata.cern.ch/record/12341',
        'doi': 'test',
        'scope': 'test',
        'sampling': 'test',
        'identity': 'test',
    }
    (tmp_path / 'manifest.json').write_text(__import__('json').dumps(manifest))
    app = Flask(__name__)
    app.config['ANALYSIS_DIRECTORY'] = tmp_path
    app.register_blueprint(bp)
    return app.test_client()


def test_metrics_lists_recent_runs(client):
    client.post('/api/investigations/runs', json={'spec': DEFAULT_SPEC})
    response = client.get('/api/investigations/metrics')
    assert response.status_code == 200
    body = response.get_json()
    assert body['recent_runs']
    assert body['fresh_compute_ms']['count'] >= 1
    assert body['product_targets']['fresh_compute_p95_ms'] == 2000
    assert 'fresh_compute_p95_within_target' in body['product_gates']
    assert body['baseline_timings'] is not None


def test_capture_baseline_timings_script(tmp_path):
    import subprocess

    root = Path(__file__).resolve().parents[2]
    output = tmp_path / 'timings.json'
    proc = subprocess.run(
        [sys.executable, str(root / 'scripts' / 'capture_baseline_timings.py'), '--output', str(output)],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    payload = json.loads(output.read_text())
    assert payload.get('captured_at')
    assert payload['fresh_compute_ms']['count'] >= 1
