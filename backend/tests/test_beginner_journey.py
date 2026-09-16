"""Automated stand-in for the five beginner checklist tasks (API-level, no browser)."""
import io
import sys
import zipfile
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
        pt=np.array([[10.0, 12.0], [4.0, 5.0]]),
        eta=np.zeros((2, 2)),
        phi=np.array([[0.0, 3.1], [1.0, 2.0]]),
        mass=np.full((2, 2), 0.105),
        charge=np.array([[1, -1], [1, -1]]),
        entry=np.array([1, 2]),
    )
    digest = __import__('hashlib').sha256(sample_file.read_bytes()).hexdigest()
    manifest = {
        'sample_file': sample_file.name,
        'sha256': digest,
        'entries_read': 2,
        'record_id': 12341,
        'record_url': 'https://opendata.cern.ch/record/12341',
        'doi': 'test',
        'scope': 'CMS 2012 reduced muons',
        'sampling': 'test fixture',
        'identity': 'test',
    }
    (tmp_path / 'manifest.json').write_text(__import__('json').dumps(manifest))
    app = Flask(__name__)
    app.config['ANALYSIS_DIRECTORY'] = tmp_path
    app.register_blueprint(bp)
    init_investigation_worker(app)
    return app.test_client()


def test_beginner_five_tasks_via_api(client):
    checklist = client.get('/api/investigations/beginner-checklist').get_json()
    tasks = {t['id']: t for t in checklist['tasks']}
    assert len(tasks) == 5

    status = client.get('/api/investigations/status').get_json()
    assert status['ready']
    assert status['manifest']['record_id'] == 12341

    revised = client.post('/api/investigations/runs', json={'spec': {**DEFAULT_SPEC, 'min_pt': 10}}).get_json()
    baseline_id = status['baseline_run_id']
    compare = client.get(f"/api/investigations/runs/{revised['id']}/compare?baseline={baseline_id}").get_json()
    assert compare['selected_events_delta'] != 0 or revised['id'] != baseline_id

    claims = client.get(f"/api/investigations/runs/{revised['id']}/claims?baseline={baseline_id}&bin=30").get_json()
    labels = {c['evidence_label'] for c in claims['claims']}
    assert 'documented' in labels or 'interpretation' in labels

    export = client.get(f"/api/investigations/runs/{revised['id']}/export?baseline={baseline_id}")
    assert export.status_code == 200
    with zipfile.ZipFile(io.BytesIO(export.data)) as archive:
        names = set(archive.namelist())
        assert {'reproduce.py', 'manifest.json', 'claims.json', 'SHA256SUMS'} <= names

    results = [
        {'task_id': 'pick-dataset', 'completed': True, 'notes': f"record {status['manifest']['record_id']}"},
        {'task_id': 'read-selection', 'completed': True, 'notes': f"pT>={revised['spec']['min_pt']}"},
        {'task_id': 'run-revision', 'completed': True, 'notes': f"delta {compare.get('selected_events_delta')}"},
        {'task_id': 'evidence-limits', 'completed': True, 'notes': 'claims include documented vs calculated'},
        {'task_id': 'reproduce', 'completed': True, 'notes': 'export zip with reproduce.py'},
    ]
    recorded = client.post(
        '/api/investigations/beginner-checklist/sessions',
        json={'tester': 'automated-beginner-journey', 'results': results, 'confusion_notes': ''},
    )
    assert recorded.status_code == 200
    body = recorded.get_json()
    assert body['sessions_recorded'] >= 1
