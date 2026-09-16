import sys
from pathlib import Path

import numpy as np
import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import investigation_agent, plan


def test_investigation_intent_detects_dimuon_question():
    assert plan.investigation_intent('Show me the CMS dimuon mass spectrum')
    assert not plan.investigation_intent('Why does CMS use a solenoid?')


@pytest.fixture
def app_ctx(tmp_path):
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
    from analysis.service import bp, compare_run_payload, directory, find_run, materialize, merged_sources

    app.register_blueprint(bp)
    ctx = app.app_context()
    ctx.push()
    yield {
        'app': app,
        'materialize': materialize,
        'directory': directory,
        'merged_sources': merged_sources,
        'find_run': find_run,
        'compare_run_payload': compare_run_payload,
    }
    ctx.pop()


def test_agent_handle_runs_selection(app_ctx):
    payload = investigation_agent.handle_query(
        'require both muons above 5 GeV',
        materialize_fn=app_ctx['materialize'],
        sample_ready_fn=lambda: (app_ctx['directory']() / 'manifest.json').exists(),
        merged_sources_fn=lambda: app_ctx['merged_sources'](cached_verbatim=True),
        compare_fn=app_ctx['compare_run_payload'],
    )
    assert payload is not None
    assert payload['investigation']['ready'] is True
    assert payload['investigation']['run']['spec']['min_pt'] == 5
    assert len(payload['investigation']['claims']) >= 3
