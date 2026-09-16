import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))


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
    from app import app as flask_app
    from analysis.service import init_investigation_worker

    flask_app.config['ANALYSIS_DIRECTORY'] = tmp_path
    init_investigation_worker(flask_app)
    return flask_app.test_client()


def test_agent_routes_dimuon_question_to_investigation_tool(client):
    response = client.post('/api/agent', json={'query': 'Show me the CMS dimuon mass spectrum and peaks'})
    assert response.status_code == 200
    body = response.get_json()
    assert 'investigation' in body
    assert body.get('tools_used') == ['investigation']
    assert body['investigation']['ready'] is True
    assert body['investigation']['run']['selected_events'] >= 0
    assert body['investigation'].get('provenance', {}).get('run_id') == body['investigation']['run']['id']
