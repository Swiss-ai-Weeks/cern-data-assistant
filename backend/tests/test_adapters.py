import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import adapters, constraints


def test_executable_adapter_is_record_12341():
    binding = adapters.executable_binding()
    assert binding['record_id'] == 12341
    assert binding['adapter_status'] == 'executable'


def test_stretch_adapter_is_catalog_only():
    stretch = adapters.for_record('30555')
    assert stretch is not None
    assert stretch['status'] == 'catalog_only'
    assert stretch['energy_tev'] == 13.0


def test_search_marks_30555_catalog_only():
    payload = constraints.enrich_search(
        'CMS dimuons 13 TeV',
        {'results': [{'recid': 30555, 'collision_energy': '13 TeV', 'title': 'DoubleMuon', 'abstract': ''}]},
    )
    assert payload['results'][0]['constraint_fit'] == 'catalog_only_adapter'
