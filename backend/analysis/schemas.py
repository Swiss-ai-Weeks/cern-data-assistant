"""Typed investigation records. Numerical results still come only from recipe.calculate."""

DEFAULT_CONSTRAINTS = {
    'experiment': 'CMS',
    'energy_tev': 8.0,
    'collision': 'pp',
    'objects': 'muons',
    'format': 'reduced 2012 muon ntuple',
    'recipe': 'dimuon-v1',
    'record_id': 12341,
    'locked': ['experiment', 'energy_tev', 'recipe', 'record_id'],
}

EVIDENCE_LABELS = [
    {
        'id': 'calculated',
        'label': 'Calculated from this sample',
        'meaning': 'A deterministic run generated this count, histogram, or comparison.',
    },
    {
        'id': 'documented',
        'label': 'Documented by CERN/CMS',
        'meaning': 'A specific authoritative passage supports this statement.',
    },
    {
        'id': 'interpretation',
        'label': 'Interpretation',
        'meaning': 'A proposed reading of the observation, with stated limits.',
    },
    {
        'id': 'not_established',
        'label': 'Not established',
        'meaning': 'The available evidence does not support the requested conclusion.',
    },
]

DEFAULT_GOAL = (
    'Compute a CMS muon-pair spectrum from the declared sample, change a supported '
    'selection, and separate calculated counts from published explanation.'
)


def validate_constraints(value):
    if value in (None, {}):
        return dict(DEFAULT_CONSTRAINTS)
    if not isinstance(value, dict):
        raise ValueError('Constraints must be an object.')
    constraints = {**DEFAULT_CONSTRAINTS, **value}
    for key in DEFAULT_CONSTRAINTS['locked']:
        if constraints.get(key) != DEFAULT_CONSTRAINTS[key]:
            raise ValueError(
                'This investigation is bound to CMS 2012 8 TeV reduced muons '
                '(record 12341). Find other data from catalog search; the sample will not be silently changed.'
            )
    if constraints.get('energy_tev') != 8.0:
        raise ValueError('This investigation uses 8 TeV data. A 13 TeV request needs a different dataset.')
    return {key: constraints[key] for key in DEFAULT_CONSTRAINTS}


def investigation_record(investigation_id, spec, *, goal=DEFAULT_GOAL, constraints=None,
                         active_run_id=None, baseline_run_id=None, run_ids=None, updated_at=None):
    return {
        'id': investigation_id,
        'goal': goal if isinstance(goal, str) and goal.strip() else DEFAULT_GOAL,
        'constraints': validate_constraints(constraints),
        'spec': spec,
        'active_run_id': active_run_id,
        'baseline_run_id': baseline_run_id,
        'run_ids': list(run_ids or []),
        'updated_at': updated_at,
        'evidence_labels': EVIDENCE_LABELS,
    }
