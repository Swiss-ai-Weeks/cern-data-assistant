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
        pt=np.array([[10.0, 12.0], [20.0, 22.0]]),
        eta=np.zeros((2, 2)),
        phi=np.array([[0.0, 3.1], [0.5, 2.5]]),
        mass=np.full((2, 2), 0.105),
        charge=np.array([[1, -1], [1, -1]]),
        entry=np.array([1, 2]),
    )
    digest = __import__('hashlib').sha256(sample_file.read_bytes()).hexdigest()
    manifest = {
        'sample_file': sample_file.name,
        'sha256': digest,
        'entries_read': 2,
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


def test_session_brief_includes_claims_and_runs(client):
    session = client.post('/api/investigations/sessions', json={'spec': DEFAULT_SPEC}).get_json()
    baseline = client.post('/api/investigations/runs', json={'spec': DEFAULT_SPEC}).get_json()
    revised = client.post('/api/investigations/runs', json={'spec': {**DEFAULT_SPEC, 'min_pt': 5}}).get_json()
    client.put(
        f"/api/investigations/sessions/{session['id']}",
        json={
            'active_run_id': revised['id'],
            'baseline_run_id': baseline['id'],
            'run_ids': [baseline['id'], revised['id']],
        },
    )
    brief = client.get(f"/api/investigations/sessions/{session['id']}/brief").get_json()
    assert brief['active_run']['id'] == revised['id']
    assert len(brief['claims']) >= 3
    assert brief['narrative']['summary']
