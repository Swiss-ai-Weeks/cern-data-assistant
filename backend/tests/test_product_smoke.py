"""Day-5 style smoke: three consecutive runs plus job reconnect."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.recipe import DEFAULT_SPEC
from analysis.service import bp, enqueue_job, init_investigation_worker


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


def _sse_result(response):
    for block in response.data.decode().split('\n\n'):
        line = next((l for l in block.split('\n') if l.startswith('data: ')), None)
        if not line:
            continue
        event = json.loads(line[6:])
        if event.get('type') == 'result':
            return event['run']
    raise AssertionError('No result event in stream')


def test_three_consecutive_investigation_runs(client):
    specs = [DEFAULT_SPEC, {**DEFAULT_SPEC, 'min_pt': 5}, {**DEFAULT_SPEC, 'charge': 'same'}]
    run_ids = []
    for spec in specs:
        response = client.post('/api/investigations/jobs/stream', json={'spec': spec})
        assert response.status_code == 200
        run = _sse_result(response)
        run_ids.append(run['id'])
    assert len(set(run_ids)) == 3


def test_smoke_job_reconnect_after_enqueue(client):
    with client.application.app_context():
        job_id = enqueue_job({**DEFAULT_SPEC, 'min_pt': 8})
    response = client.get(f'/api/investigations/jobs/{job_id}/stream')
    run = _sse_result(response)
    assert run['spec']['min_pt'] == 8
