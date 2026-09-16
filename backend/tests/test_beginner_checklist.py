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
    (tmp_path / 'manifest.json').write_text(json.dumps(manifest))
    app = Flask(__name__)
    app.config['ANALYSIS_DIRECTORY'] = tmp_path
    app.register_blueprint(bp)
    return app.test_client()


def test_status_includes_product_gates_and_checklist(client):
    body = client.get('/api/investigations/status').get_json()
    assert body['ready'] is True
    assert body['product_phase']['feature_freeze_core'] is True
    assert body['eval_cases_frozen'] == 30
    assert len(body['beginner_checklist']) == 5


def test_record_beginner_session_persists(client):
    listed = client.get('/api/investigations/beginner-checklist').get_json()
    task_id = listed['tasks'][0]['id']
    response = client.post(
        '/api/investigations/beginner-checklist/sessions',
        json={
            'tester': 'Reviewer A',
            'results': [{'task_id': task_id, 'completed': True, 'notes': 'Named record 12341.'}],
            'confusion_notes': 'None',
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['sessions_recorded'] == 1
    again = client.get('/api/investigations/beginner-checklist').get_json()
    assert len(again['sessions']) == 1
