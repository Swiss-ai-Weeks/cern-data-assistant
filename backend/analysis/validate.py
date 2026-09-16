"""Validate reference features on the prepared bounded sample."""
from . import recipe


def reference_feature_report(histogram: dict) -> dict:
    """Compare the 28–33 GeV region to neighboring bins on the default selection."""
    counts = histogram['counts']
    edges = histogram['edges']
    z_bin = next((i for i in range(len(counts)) if edges[i] <= 91 < edges[i + 1]), None)
    if z_bin is None:
        z_bin = min(range(len(counts)), key=lambda i: abs((edges[i] + edges[i + 1]) / 2 - 91))
    region = range(28, min(33, len(counts)))
    region_counts = [counts[i] for i in region]
    region_total = sum(region_counts)
    z_count = counts[z_bin]
    neighbor_values = counts[max(0, z_bin - 2):z_bin] + counts[z_bin + 1:z_bin + 3]
    neighbor_avg = max(1.0, sum(neighbor_values) / max(1, len(neighbor_values)))
    region_peak = max(region_counts) if region_counts else 0
    baseline = max(1, sum(counts[20:27]) / 7)
    region_ratio = region_peak / baseline
    z_ratio = z_count / neighbor_avg
    return {
        'z_peak_bin_gev': f'{edges[z_bin]:g}–{edges[z_bin + 1]:g}',
        'z_events': int(z_count),
        'region_28_33_gev_events': int(region_total),
        'region_peak_bin_events': int(region_peak),
        'region_peak_over_local_baseline': round(region_ratio, 2),
        'z_over_neighbor_average': round(z_ratio, 2),
        'reference_feature_visible': round(region_ratio, 2) >= 1.15,
        'z_visible': z_ratio >= 1.25,
        'note': 'Heuristic check on the bounded sample only; not a physics significance test.',
    }


def day_one_gate(histogram: dict, *, entries_read: int | None = None) -> dict:
    """
    Day-1 product gate: the documented ~30 GeV discussion region and Z vicinity should
    both be visible on the bounded reference selection before we treat the flagship story as proven.
    """
    report = reference_feature_report(histogram)
    z_ok = bool(report.get('z_visible'))
    feature_ok = bool(report.get('reference_feature_visible'))
    passed = feature_ok and z_ok
    if passed:
        message = (
            'The bounded sample shows elevated activity in 28–33 GeV and a Z-region peak '
            'consistent with the documented reference case on this selection.'
        )
    elif not feature_ok and not z_ok:
        message = (
            'Neither the 28–33 GeV heuristic nor the Z-region peak cleared on this sample. '
            'Re-prepare with more entries or disclose a cached reference run before demoing the trigger story.'
        )
    elif not feature_ok:
        message = (
            'Z-region activity is present, but the 28–33 GeV heuristic did not clear on this bounded sample. '
            'The trigger-feature narrative may be weak until the sample or selection is adjusted.'
        )
    else:
        message = (
            'The 28–33 GeV heuristic cleared, but the Z peak is weak on this sample. '
            'Check sample size and the default opposite-charge selection.'
        )
    return {
        'passed': passed,
        'reference_feature_visible': feature_ok,
        'z_visible': z_ok,
        'entries_read': entries_read,
        'reference_validation': report,
        'message': message,
    }
