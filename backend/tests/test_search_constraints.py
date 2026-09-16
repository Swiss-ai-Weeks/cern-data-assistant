import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import constraints


def test_thirteen_tev_query_does_not_bind_investigation():
    payload = constraints.enrich_search(
        'proton-proton collisions at 13 TeV with muons',
        {'results': [{'recid': 30555, 'collision_energy': '13 TeV', 'title': 'CMS', 'abstract': ''}]},
    )
    assert payload['constraint_match'] == 'energy_mismatch'
    assert payload['investigation_binding']['available'] is False
    assert payload['constraint_notes']
    assert any('30555' in note for note in payload['constraint_notes'])


def test_eight_tev_query_notes_executable_adapter():
    payload = constraints.enrich_search(
        'CMS dimuons at 8 TeV',
        {'results': [{'recid': 12341, 'collision_energy': '8 TeV', 'title': 'Reduced muons', 'abstract': ''}]},
    )
    assert payload['constraint_match'] == 'energy_match'
    assert payload['results'][0]['constraint_fit'] == 'executable_sample'
