"""Structured ClaimEvidence objects — link statements to run fields and sources."""
from __future__ import annotations

from . import schemas


def _ref_run(field: str, run_id: str) -> dict:
    return {'kind': 'run_field', 'run_id': run_id, 'field': field}


def _ref_bin(low: float, high: float, run_id: str) -> dict:
    return {'kind': 'histogram_bin', 'run_id': run_id, 'low_gev': low, 'high_gev': high}


def resolve_refs(run: dict, refs: list[dict], *, baseline: dict | None = None) -> list[dict]:
    """Materialize claim pointers into inspectable values (senior evidence audit)."""
    resolved: list[dict] = []
    hist = run.get('histogram') or {}
    edges = hist.get('edges') or []
    counts = hist.get('counts') or []
    for ref in refs or []:
        kind = ref.get('kind')
        item = {'kind': kind, **{k: v for k, v in ref.items() if k != 'kind'}}
        if kind == 'run_field':
            target = run if ref.get('run_id') == run.get('id') else baseline
            field = ref.get('field')
            if target and field:
                value = target.get(field) if field != 'spec' else target.get('spec')
                item['value'] = value
        elif kind == 'histogram_bin':
            low = ref.get('low_gev')
            high = ref.get('high_gev')
            if low is not None and high is not None and edges:
                for i in range(len(counts)):
                    if abs(edges[i] - float(low)) < 1e-6 and abs(edges[i + 1] - float(high)) < 1e-6:
                        item['value'] = {'events': counts[i], 'low_gev': low, 'high_gev': high}
                        break
        elif kind == 'source':
            item['value'] = {'source_id': ref.get('source_id'), 'url': ref.get('url')}
        resolved.append(item)
    return resolved


def _ref_source(source_id: str, url: str | None = None) -> dict:
    ref = {'kind': 'source', 'source_id': source_id}
    if url:
        ref['url'] = url
    return ref


def build_claims(
    run: dict,
    *,
    baseline: dict | None = None,
    comparison: dict | None = None,
    reference_validation: dict | None = None,
    sources: list[dict] | None = None,
    focus_bin: int | None = None,
) -> list[dict]:
    run_id = run['id']
    spec = run['spec']
    hist = run['histogram']
    claims: list[dict] = []

    claims.append({
        'id': 'selected-events',
        'evidence_label': 'calculated',
        'statement': (
            f'{run["selected_events"]:,} events pass the active selection '
            f'(pT ≥ {spec["min_pt"]:g} GeV, |η| ≤ {spec["max_abs_eta"]:g}, {spec["charge"]} charge).'
        ),
        'refs': [_ref_run('selected_events', run_id), _ref_run('spec', run_id)],
    })

    claims.append({
        'id': 'plotted-spectrum',
        'evidence_label': 'calculated',
        'statement': f'{run["plotted_events"]:,} selected events fall in the plotted 0–120 GeV histogram.',
        'refs': [_ref_run('plotted_events', run_id), _ref_run('histogram', run_id)],
    })

    if reference_validation:
        claims.append({
            'id': 'reference-heuristic',
            'evidence_label': 'calculated',
            'statement': reference_validation.get('note', 'Heuristic reference check on this bounded sample.'),
            'refs': [_ref_run('histogram', run_id)],
            'metrics': reference_validation,
        })
        if reference_validation.get('reference_feature_visible'):
            claims.append({
                'id': 'feature-28-33',
                'evidence_label': 'calculated',
                'statement': (
                    f'The 28–33 GeV region contains {reference_validation["region_28_33_gev_events"]:,} events '
                    f'with a local peak {reference_validation["region_peak_over_local_baseline"]}× above neighboring bins '
                    f'on this sample (not a significance test).'
                ),
                'refs': [_ref_bin(28, 33, run_id)],
                'metrics': {
                    'region_events': reference_validation['region_28_33_gev_events'],
                    'peak_over_baseline': reference_validation['region_peak_over_local_baseline'],
                },
            })

    doc_source = next((s for s in (sources or []) if s.get('id') in {'analysis', 'record-12342'}), None)
    if doc_source:
        claims.append({
            'id': 'documented-trigger',
            'evidence_label': 'documented',
            'statement': (
                'CERN’s reference dimuon analysis describes a feature around 30 GeV as a trigger effect, '
                'not evidence of a new particle resonance.'
            ),
            'refs': [_ref_source(doc_source['id'], doc_source.get('url'))],
            'excerpt': doc_source.get('summary') or doc_source.get('excerpt'),
        })

    if focus_bin is not None and 0 <= focus_bin < len(hist['counts']):
        low, high = hist['edges'][focus_bin], hist['edges'][focus_bin + 1]
        count = hist['counts'][focus_bin]
        claims.append({
            'id': f'bin-{focus_bin}',
            'evidence_label': 'calculated',
            'statement': f'Bin {low:g}–{high:g} GeV contains {count:,} events under the current selection.',
            'refs': [_ref_bin(low, high, run_id)],
        })
        if 28 <= low < 33:
            claims.append({
                'id': 'bin-in-documented-region',
                'evidence_label': 'interpretation',
                'statement': (
                    'This bin lies in the region CMS discusses alongside trigger effects. '
                    'Observing events here is not, by itself, a discovery claim.'
                ),
                'refs': [_ref_bin(low, high, run_id), _ref_source('analysis', doc_source.get('url') if doc_source else None)],
            })

    if baseline and comparison:
        delta = comparison.get('selected_events_delta', run['selected_events'] - baseline['selected_events'])
        claims.append({
            'id': 'revision-impact',
            'evidence_label': 'calculated',
            'statement': f'Compared with the reference run, the selection changed the event count by {delta:+,}.',
            'refs': [_ref_run('selected_events', run_id), _ref_run('selected_events', baseline['id'])],
            'comparison': {
                'baseline_run_id': baseline['id'],
                'selected_events_delta': delta,
            },
        })
        peak_shift = None
        for row in comparison.get('histogram_delta') or []:
            if peak_shift is None or abs(row['delta']) > abs(peak_shift['delta']):
                peak_shift = row
        if peak_shift and peak_shift['delta'] != 0:
            claims.append({
                'id': 'largest-bin-shift',
                'evidence_label': 'calculated',
                'statement': (
                    f'Largest histogram shift versus reference: {peak_shift["low"]:g}–{peak_shift["high"]:g} GeV '
                    f'({peak_shift["delta"]:+,} events).'
                ),
                'refs': [_ref_bin(peak_shift['low'], peak_shift['high'], run_id)],
            })

    claims.append({
        'id': 'not-discovery',
        'evidence_label': 'not_established',
        'statement': (
            'This workspace does not estimate statistical significance or establish a new particle. '
            'Use calculated counts and documented passages separately.'
        ),
        'refs': [],
    })

    label_index = {item['id']: item for item in schemas.EVIDENCE_LABELS}
    for claim in claims:
        claim['label'] = label_index.get(claim['evidence_label'], {}).get('label', claim['evidence_label'])
        claim['resolved_refs'] = resolve_refs(run, claim.get('refs') or [], baseline=baseline)
    return claims
