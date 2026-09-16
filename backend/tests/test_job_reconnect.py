import json
import sys
from pathlib import Path

import numpy as np
import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import jobs
from analysis.recipe import DEFAULT_SPEC
from analysis.service import bp, connection, enqueue_job, init_investigation_worker


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


def _collect_sse(response):
    events = []
    for block in response.data.decode().split('\n\n'):
        line = next((l for l in block.split('\n') if l.startswith('data: ')), None)
        if line:
            events.append(json.loads(line[6:]))
    return events


def test_job_stream_reconnect_by_id(client):
    with client.application.app_context():
        job_id = enqueue_job(DEFAULT_SPEC)
    response = client.get(f'/api/investigations/jobs/{job_id}/stream')
    assert response.status_code == 200
    events = _collect_sse(response)
    assert any(event['type'] == 'result' for event in events)


def test_job_stream_post_reconnect(client):
    with client.application.app_context():
        job_id = enqueue_job(DEFAULT_SPEC)
    response = client.post('/api/investigations/jobs/stream', json={'job_id': job_id})
    assert response.status_code == 200
    events = _collect_sse(response)
    assert any(event['type'] == 'result' for event in events)
