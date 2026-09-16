"""Human-readable revision narratives from structured comparisons."""
from __future__ import annotations


def revision_narrative(comparison: dict, *, baseline_label: str = 'reference', current_label: str = 'current') -> dict:
    spec_a = comparison.get('spec_baseline') or {}
    spec_b = comparison.get('spec_current') or {}
    changes: list[str] = []
    if spec_a.get('min_pt') != spec_b.get('min_pt'):
        changes.append(f"Minimum muon pT changed from {spec_a.get('min_pt', 0):g} to {spec_b.get('min_pt', 0):g} GeV.")
    if spec_a.get('max_abs_eta') != spec_b.get('max_abs_eta'):
        changes.append(f"Maximum |η| changed from {spec_a.get('max_abs_eta', 0):g} to {spec_b.get('max_abs_eta', 0):g}.")
    if spec_a.get('charge') != spec_b.get('charge'):
        changes.append(f"Charge pairing changed from {spec_a.get('charge')} to {spec_b.get('charge')}.")

    delta = comparison.get('selected_events_delta', 0)
    summary = (
        f'The {current_label} selection yields {delta:+,} events versus the {baseline_label} run. '
        + (' '.join(changes) if changes else 'Selection parameters match the reference.')
    )

    cutflow_notes = []
    for row in comparison.get('cutflow_delta') or []:
        if row.get('delta'):
            cutflow_notes.append(f"{row['label']}: {row['delta']:+,} events")

    histogram_notes = []
    for row in sorted(comparison.get('histogram_delta') or [], key=lambda r: abs(r.get('delta', 0)), reverse=True)[:3]:
        if row.get('delta'):
            histogram_notes.append(
                f"{row['low']:g}–{row['high']:g} GeV: {row['delta']:+,} events "
                f"({row['current']:,} vs {row['baseline']:,})"
            )

    return {
        'summary': summary,
        'spec_changes': changes,
        'cutflow_delta': cutflow_notes,
        'histogram_shifts': histogram_notes,
    }
