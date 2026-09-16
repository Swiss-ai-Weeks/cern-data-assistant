import sys
from pathlib import Path

import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import schemas
from analysis.recipe import DEFAULT_SPEC
from analysis.service import bp


@pytest.fixture
def client(tmp_path):
    app = Flask(__name__)
    app.config['ANALYSIS_DIRECTORY'] = tmp_path
    app.register_blueprint(bp)
    return app.test_client()


def test_constraints_reject_silent_energy_change():
    with pytest.raises(ValueError):
        schemas.validate_constraints({'energy_tev': 13})


def test_create_and_update_investigation_session(client):
    created = client.post('/api/investigations/sessions', json={'spec': DEFAULT_SPEC}).get_json()
    assert len(created['id']) == 20
    assert created['constraints']['energy_tev'] == 8.0
    assert len(created['evidence_labels']) == 4

    loaded = client.get(f"/api/investigations/sessions/{created['id']}").get_json()
    assert loaded['id'] == created['id']

    updated = client.put(
        f"/api/investigations/sessions/{created['id']}",
        json={'spec': {**DEFAULT_SPEC, 'min_pt': 5}},
    ).get_json()
    assert updated['spec']['min_pt'] == 5


def test_session_stores_pending_job_id(client, tmp_path):
    import numpy as np

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
    from analysis.service import enqueue_job, init_investigation_worker

    app = client.application
    init_investigation_worker(app)
    with app.app_context():
        job_id = enqueue_job(DEFAULT_SPEC)
    created = client.post('/api/investigations/sessions', json={'spec': DEFAULT_SPEC}).get_json()
    saved = client.put(
        f"/api/investigations/sessions/{created['id']}",
        json={'pending_job_id': job_id},
    ).get_json()
    assert saved['pending_job_id'] == job_id
