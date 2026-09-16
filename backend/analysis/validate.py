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
    neighbor = max(1, sum(counts[max(0, z_bin - 3):z_bin] + counts[z_bin + 1:z_bin + 4]))
    region_peak = max(region_counts) if region_counts else 0
    baseline = max(1, sum(counts[20:27]) // 7)
    return {
        'z_peak_bin_gev': f'{edges[z_bin]:g}–{edges[z_bin + 1]:g}',
        'z_events': int(z_count),
        'region_28_33_gev_events': int(region_total),
        'region_peak_bin_events': int(region_peak),
        'region_peak_over_local_baseline': round(region_peak / baseline, 2),
        'z_over_neighbor_average': round(z_count / neighbor, 2),
        'reference_feature_visible': region_peak >= baseline * 1.15,
        'z_visible': z_count >= neighbor * 0.5,
        'note': 'Heuristic check on the bounded sample only; not a physics significance test.',
    }
