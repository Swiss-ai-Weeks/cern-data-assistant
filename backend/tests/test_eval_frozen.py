import json
import sys
from pathlib import Path

import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.recipe import DEFAULT_SPEC
from analysis.service import bp

FIXTURE = Path(__file__).parents[1] / 'analysis' / 'eval_cases.json'


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(bp)
    return app.test_client()


@pytest.fixture
def cases():
    payload = json.loads(FIXTURE.read_text())
    return payload['cases']


def test_frozen_eval_fixture_is_present(cases):
    assert len(cases) >= 30


@pytest.mark.parametrize('case', json.loads(FIXTURE.read_text())['cases'], ids=lambda c: c['id'])
def test_frozen_investigation_suggest_cases(client, case):
    response = client.post('/api/investigations/suggest', json={'query': case['query'], 'spec': DEFAULT_SPEC})
    assert response.status_code == 200
    body = response.get_json()
    assert body['action'] == case['expect_action']
    if case.get('expect_min_pt') is not None:
        assert body.get('spec', {}).get('min_pt') == case['expect_min_pt']
    if case.get('expect_charge'):
        assert body.get('spec', {}).get('charge') == case['expect_charge']
    if case.get('expect_max_abs_eta') is not None:
        assert body.get('spec', {}).get('max_abs_eta') == case['expect_max_abs_eta']
