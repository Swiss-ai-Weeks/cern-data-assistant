"""Canonical dimuon recipe, also included verbatim in exported investigations.

Inputs contain only the exactly-two-muon subset of a declared source-entry range.
All kinematics are computed in float64; no model participates in numerical work.
"""
import hashlib
import json
import math
from pathlib import Path

import numpy as np

VERSION = 'dimuon-v1'
DEFAULT_SPEC = {'min_pt': 0.0, 'max_abs_eta': 5.0, 'charge': 'opposite'}
EDGES = np.linspace(0.0, 120.0, 121)


def deterministic_run_id(manifest: dict, spec: dict, *, recipe_path: Path | None = None) -> str:
    recipe_path = recipe_path or Path(__file__)
    recipe_hash = hashlib.sha256(recipe_path.read_bytes()).hexdigest()
    key = json.dumps(
        {'spec': validate_spec(spec), 'sample': manifest['sha256'], 'recipe': recipe_hash},
        sort_keys=True,
    )
    return hashlib.sha256(key.encode()).hexdigest()[:20]


def validate_spec(value):
    if not isinstance(value, dict):
        raise ValueError('Analysis conditions must be an object.')
    if set(value) - set(DEFAULT_SPEC):
        raise ValueError('Unsupported analysis condition.')
    spec = {**DEFAULT_SPEC, **value}
    for key, lo, hi in [('min_pt', 0, 100), ('max_abs_eta', 0.1, 5)]:
        v = spec[key]
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not lo <= v <= hi:
            raise ValueError(f'{key} must be a finite number between {lo} and {hi}.')
        spec[key] = float(v)
    if spec['charge'] not in ('opposite', 'same', 'any'):
        raise ValueError('Charge selection must be opposite, same, or any.')
    return spec


def invariant_mass(data):
    pt, eta, phi, mass = (np.asarray(data[k], dtype=np.float64) for k in ('pt', 'eta', 'phi', 'mass'))
    px, py, pz = pt * np.cos(phi), pt * np.sin(phi), pt * np.sinh(eta)
    energy = np.sqrt(mass * mass + pt * pt + pz * pz)
    m2 = energy.sum(axis=1)**2 - px.sum(axis=1)**2 - py.sum(axis=1)**2 - pz.sum(axis=1)**2
    return np.sqrt(np.maximum(m2, 0.0))


def select(data, spec):
    spec = validate_spec(spec)
    finite = np.ones(len(data['entry']), dtype=bool)
    for key in ('pt', 'eta', 'phi', 'mass'):
        finite &= np.isfinite(data[key]).all(axis=1)
    finite &= (data['pt'] >= 0).all(axis=1) & (data['mass'] >= 0).all(axis=1)
    finite &= np.isin(data['charge'], [-1, 1]).all(axis=1)
    charge = finite.copy()
    if spec['charge'] != 'any':
        opposite = data['charge'][:, 0] != data['charge'][:, 1]
        charge &= opposite if spec['charge'] == 'opposite' else ~opposite
    momentum = charge & (data['pt'] >= spec['min_pt']).all(axis=1)
    accepted = momentum & (np.abs(data['eta']) <= spec['max_abs_eta']).all(axis=1)
    steps = [('Valid kinematics', finite), ('Charge selection', charge),
             ('Muon momentum', momentum), ('Muon acceptance', accepted)]
    return accepted, [{'label': label, 'count': int(mask.sum())} for label, mask in steps]


def calculate(data, spec, manifest):
    spec = validate_spec(spec)
    selected, steps = select(data, spec)
    values = invariant_mass(data)[selected]
    counts, edges = np.histogram(values, bins=EDGES)
    return {
        'recipe': VERSION, 'spec': spec,
        'cutflow': [{'label': 'Source entries read', 'count': manifest['entries_read']},
                    {'label': 'Exactly two muons', 'count': len(data['entry'])}] + steps,
        'histogram': {'edges': edges.tolist(), 'counts': counts.tolist(),
                      'underflow': int((values < EDGES[0]).sum()),
                      'overflow': int((values > EDGES[-1]).sum()),
                      'x_label': 'Muon-pair invariant mass (GeV)', 'y_label': 'Events / 1 GeV'},
        'selected_events': int(selected.sum()), 'plotted_events': int(counts.sum()),
    }
