import json
import sys
from pathlib import Path

import numpy as np
import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
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


def test_product_summary_for_judges(client):
    response = client.get('/api/investigations/product-summary')
    assert response.status_code == 200
    body = response.get_json()
    assert body['eval_cases_frozen'] == 30
    assert body['feature_freeze_core'] is True
    assert body['investigation']['executable_record'] == '12341'
    assert 'verification' in body
    assert body['stretch_adapter']['record_id'] == '30555'
    assert body['stretch_adapter']['runnable_in_this_release'] is False
