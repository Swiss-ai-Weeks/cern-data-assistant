import sys
from pathlib import Path
from unittest import mock

import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.service import bp


@pytest.fixture
def client(tmp_path):
    app = Flask(__name__)
    app.config['ANALYSIS_DIRECTORY'] = tmp_path
    app.register_blueprint(bp)
    return app.test_client()


def test_refresh_sources_fetches_records(client):
    payload = {'metadata': {'title': 'Refreshed', 'abstract': 'Updated excerpt.'}}
    with mock.patch('analysis.source_passages.requests.get') as get:
        get.return_value.json.return_value = payload
        get.return_value.raise_for_status = lambda: None
        response = client.post('/api/investigations/sources/refresh')
    assert response.status_code == 200
    body = response.get_json()
    assert len(body['refreshed']) == 2
    assert body['sources']
