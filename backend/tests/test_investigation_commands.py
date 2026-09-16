import sys
import hashlib
import io
import json
from pathlib import Path
import zipfile

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.service import bp
from analysis.recipe import DEFAULT_SPEC
from flask import Flask


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(bp)
    return app.test_client()


def test_harder_is_a_selection_revision(client):
    response = client.post('/api/investigations/suggest', json={
        'query': 'make both muons harder', 'spec': DEFAULT_SPEC,
    })
    assert response.status_code == 200
    body = response.get_json()
    assert body['action'] == 'selection'
    assert body['spec']['min_pt'] == 10


def test_bump_routes_to_documented_evidence(client):
    response = client.post('/api/investigations/suggest', json={
        'query': 'what does this bump mean?', 'spec': DEFAULT_SPEC,
    })
    assert response.get_json()['action'] == 'evidence'


def test_energy_change_is_not_silently_accepted(client):
    response = client.post('/api/investigations/suggest', json={
        'query': 'run this at 13 TeV', 'spec': DEFAULT_SPEC,
    })
    assert response.get_json()['action'] == 'unsupported'


@pytest.mark.parametrize('query', ['require isolated muons', 'filter by trigger bits', 'use raw detector hits'])
def test_missing_columns_are_not_invented(client, query):
    response = client.post('/api/investigations/suggest', json={
        'query': query, 'spec': DEFAULT_SPEC,
    })
    body = response.get_json()
    assert body['action'] == 'unsupported'
    assert 'not available' in body['message']


def test_export_is_self_contained_and_tamper_evident(tmp_path):
    sample_file = tmp_path / 'sample-0000000000000000.npz'
    np.savez_compressed(sample_file, pt=np.array([[10.0, 12.0]]), eta=np.zeros((1, 2)),
                        phi=np.array([[0.0, np.pi]]), mass=np.full((1, 2), 0.105),
                        charge=np.array([[1, -1]]), entry=np.array([42]))
    digest = hashlib.sha256(sample_file.read_bytes()).hexdigest()
    manifest = {'sample_file': sample_file.name, 'sha256': digest, 'entries_read': 1,
                'record_url': 'https://opendata.cern.ch/record/12341', 'doi': 'test-doi',
                'scope': 'Test scope.', 'sampling': 'Test sampling.', 'identity': 'test'}
    (tmp_path / 'manifest.json').write_text(json.dumps(manifest))
    app = Flask(__name__)
    app.config['ANALYSIS_DIRECTORY'] = tmp_path
    app.register_blueprint(bp)
    test_client = app.test_client()
    created = test_client.post('/api/investigations/runs', json={'spec': DEFAULT_SPEC}).get_json()

    response = test_client.get(f"/api/investigations/runs/{created['id']}/export")
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        names = set(archive.namelist())
        assert {'SHA256SUMS', 'provenance.json', 'reproduce.py', 'investigation.ipynb'} <= names
        for line in archive.read('SHA256SUMS').decode().splitlines():
            expected, name = line.split('  ', 1)
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected
        provenance = json.loads(archive.read('provenance.json'))
        assert provenance['run_id'] == created['id']
        assert provenance['sample_sha256'] == digest
