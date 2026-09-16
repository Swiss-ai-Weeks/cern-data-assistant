"""Agent bridge: route spectrum/dimuon intent to deterministic investigation tools."""
from __future__ import annotations

from . import claims, plan, recipe, validate


def handle_query(query: str, *, materialize_fn, sample_ready_fn, merged_sources_fn, compare_fn):
    """
    Returns a payload dict for the agent result, or None if the query is not investigation-shaped.
    compare_fn(run_id, baseline_id) -> comparison dict
    """
    if not plan.investigation_intent(query):
        return None
    if not sample_ready_fn():
        return {
            'investigation': {
                'ready': False,
                'message': 'The bounded CMS sample is not staged on this server. Open Investigate after prepare runs on the host.',
            },
            'goal': query,
            'tools_used': ['investigation'],
        }

    interpretation = plan.interpret_investigation_query(query, recipe.DEFAULT_SPEC)
    baseline_run = materialize_fn(recipe.DEFAULT_SPEC)
    sources = merged_sources_fn()
    ref_val = validate.reference_feature_report(baseline_run['histogram'])

    run = baseline_run
    if interpretation['action'] == 'selection' and interpretation.get('spec'):
        run = materialize_fn(interpretation['spec'])

    comparison = None
    if run['id'] != baseline_run['id']:
        comparison = compare_fn(run['id'], baseline_run['id'])

    claim_list = claims.build_claims(
        run,
        baseline=baseline_run if comparison else None,
        comparison=comparison,
        reference_validation=ref_val,
        sources=sources,
        focus_bin=30 if '30' in query or 'bump' in query.lower() or 'peak' in query.lower() else None,
    )

    return {
        'goal': query,
        'tools_used': ['investigation'],
        'plan': {'search_query': None, 'ask_query': None, 'investigation': True},
        'investigation': {
            'ready': True,
            'interpretation': interpretation,
            'baseline_run_id': baseline_run['id'],
            'run': run,
            'claims': claim_list,
            'reference_validation': ref_val,
        },
        'search': None,
        'answer': None,
        'picked': None,
        'followups': [
            'Require both muons above 10 GeV',
            'What does the bump around 30 GeV mean?',
            'Compare this with the original selection',
        ],
    }
