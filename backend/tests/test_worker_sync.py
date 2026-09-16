"""Senior reliability: synchronous worker drain and reconnect after virtual restart."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.recipe import DEFAULT_SPEC
from analysis.service import bp, connection, enqueue_job, init_investigation_worker


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
    app.config['ANALYSIS_WORKER_SYNC'] = True
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
            return event
    raise AssertionError('missing result event')


def test_sync_enqueue_completes_before_stream(client):
    with client.application.app_context():
        job_id = enqueue_job({**DEFAULT_SPEC, 'min_pt': 6})
        with connection() as db:
            from analysis import jobs

            payload = jobs.get(db, job_id)
        assert payload['status'] == 'complete'
    response = client.post('/api/investigations/jobs/stream', json={'job_id': job_id})
    event = _sse_result(response)
    assert event['run']['spec']['min_pt'] == 6


def test_metrics_reports_sync_worker_and_empty_queue(client):
    client.post('/api/investigations/runs', json={'spec': DEFAULT_SPEC})
    body = client.get('/api/investigations/metrics').get_json()
    assert body['worker_mode'] == 'sync'
    assert body['job_queue']['queued'] == 0
