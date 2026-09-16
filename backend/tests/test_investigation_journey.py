"""Full investigation journey — status, revise, compare, claims, export."""
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


def test_investigation_journey_end_to_end(client):
    status = client.get('/api/investigations/status').get_json()
    assert status['ready'] is True
    baseline_id = status['baseline_run_id']

    revised = client.post('/api/investigations/runs', json={'spec': {**DEFAULT_SPEC, 'min_pt': 8}}).get_json()
    compare = client.get(f"/api/investigations/runs/{revised['id']}/compare?baseline={baseline_id}").get_json()
    assert 'histogram_delta' in compare

    claims = client.get(f"/api/investigations/runs/{revised['id']}/claims?baseline={baseline_id}&bin=30").get_json()
    assert len(claims['claims']) >= 4

    narrative = client.get(f"/api/investigations/runs/{revised['id']}/narrative?baseline={baseline_id}").get_json()
    assert narrative['summary']

    export = client.get(f"/api/investigations/runs/{revised['id']}/export")
    assert export.status_code == 200
    with zipfile.ZipFile(io.BytesIO(export.data)) as archive:
        assert 'reproduce.py' in archive.namelist()
