import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis.validate import reference_feature_report


def test_reference_validation_shape():
    histogram = {
        'edges': list(range(121)),
        'counts': [1] * 120,
    }
    histogram['counts'][30] = 50
    histogram['counts'][91] = 200
    report = reference_feature_report(histogram)
    assert report['region_28_33_gev_events'] >= 50
    assert 'reference_feature_visible' in report
