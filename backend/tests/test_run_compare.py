import sys
from pathlib import Path

import numpy as np
import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.recipe import DEFAULT_SPEC
from analysis.service import bp, init_investigation_worker


@pytest.fixture
def client(tmp_path):
    sample_file = tmp_path / 'sample-0000000000000000.npz'
    np.savez_compressed(
        sample_file,
        pt=np.array([[10.0, 12.0], [4.0, 5.0], [20.0, 22.0]]),
        eta=np.zeros((3, 2)),
        phi=np.array([[0.0, 3.1], [1.0, 2.0], [0.5, 2.5]]),
        mass=np.full((3, 2), 0.105),
        charge=np.array([[1, -1], [1, -1], [1, 1]]),
        entry=np.array([1, 2, 3]),
    )
    digest = __import__('hashlib').sha256(sample_file.read_bytes()).hexdigest()
    manifest = {
        'sample_file': sample_file.name,
        'sha256': digest,
        'entries_read': 3,
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
    init_investigation_worker(app)
    return app.test_client()


def test_compare_runs_reports_histogram_delta(client):
    baseline = client.post('/api/investigations/runs', json={'spec': DEFAULT_SPEC}).get_json()
    revised = client.post('/api/investigations/runs', json={'spec': {**DEFAULT_SPEC, 'min_pt': 10}}).get_json()
    response = client.get(f"/api/investigations/runs/{revised['id']}/compare?baseline={baseline['id']}")
    assert response.status_code == 200
    body = response.get_json()
    assert body['selected_events_delta'] == revised['selected_events'] - baseline['selected_events']
    assert len(body['histogram_delta']) == len(revised['histogram']['counts'])
    assert any(entry['delta'] != 0 for entry in body['histogram_delta']) or body['selected_events_delta'] == 0
