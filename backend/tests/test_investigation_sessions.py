import sys
from pathlib import Path

import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import schemas
from analysis.recipe import DEFAULT_SPEC
from analysis.service import bp


@pytest.fixture
def client(tmp_path):
    app = Flask(__name__)
    app.config['ANALYSIS_DIRECTORY'] = tmp_path
    app.register_blueprint(bp)
    return app.test_client()


def test_constraints_reject_silent_energy_change():
    with pytest.raises(ValueError):
        schemas.validate_constraints({'energy_tev': 13})


def test_create_and_update_investigation_session(client):
    created = client.post('/api/investigations/sessions', json={'spec': DEFAULT_SPEC}).get_json()
    assert len(created['id']) == 20
    assert created['constraints']['energy_tev'] == 8.0
    assert len(created['evidence_labels']) == 4

    loaded = client.get(f"/api/investigations/sessions/{created['id']}").get_json()
    assert loaded['id'] == created['id']

    updated = client.put(
        f"/api/investigations/sessions/{created['id']}",
        json={'spec': {**DEFAULT_SPEC, 'min_pt': 5}},
    ).get_json()
    assert updated['spec']['min_pt'] == 5
