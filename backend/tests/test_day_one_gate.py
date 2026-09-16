import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.validate import day_one_gate, reference_feature_report


def _histogram_with_bumps():
    histogram = {'edges': list(range(121)), 'counts': [2] * 120}
    for i in range(28, 33):
        histogram['counts'][i] = 40
    histogram['counts'][91] = 220
    return histogram


def test_day_one_gate_passes_on_synthetic_reference_shape():
    histogram = _histogram_with_bumps()
    gate = day_one_gate(histogram, entries_read=500_000)
    assert gate['passed'] is True
    assert gate['reference_feature_visible'] is True
    assert gate['z_visible'] is True


def test_day_one_gate_fails_on_flat_spectrum():
    histogram = {'edges': list(range(121)), 'counts': [1] * 120}
    gate = day_one_gate(histogram)
    assert gate['passed'] is False
    assert 'message' in gate


def test_reference_feature_visible_on_bump():
    histogram = _histogram_with_bumps()
    report = reference_feature_report(histogram)
    assert report['reference_feature_visible'] is True
