import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import claims, recipe


def test_claims_include_resolved_run_field_refs():
    run = {
        'id': 'abc123',
        'selected_events': 42,
        'spec': recipe.DEFAULT_SPEC,
        'histogram': {'edges': [0, 1, 2], 'counts': [1, 2]},
        'plotted_events': 3,
        'cutflow': [],
    }
    built = claims.build_claims(run, reference_validation=None, sources=[])
    selected = next(c for c in built if c['id'] == 'selected-events')
    assert selected['resolved_refs']
    assert selected['resolved_refs'][0]['value'] == 42
