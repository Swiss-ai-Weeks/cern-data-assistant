import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import claims


def test_build_claims_includes_calculated_and_not_established():
    run = {
        'id': 'abc123456789012345678',
        'spec': {'min_pt': 0, 'max_abs_eta': 5, 'charge': 'opposite'},
        'selected_events': 100,
        'plotted_events': 95,
        'histogram': {'edges': list(range(121)), 'counts': [0] * 120},
    }
    out = claims.build_claims(run, reference_validation={'note': 'test', 'region_28_33_gev_events': 0, 'region_peak_over_local_baseline': 1})
    labels = {item['evidence_label'] for item in out}
    assert 'calculated' in labels
    assert 'not_established' in labels
