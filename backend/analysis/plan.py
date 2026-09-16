"""Deterministic investigation planning — no LLM in the numeric path."""
from __future__ import annotations

import re

from . import recipe


def investigation_intent(query: str) -> bool:
    q = (query or '').lower()
    if not q.strip():
        return False
    patterns = (
        r'\bdimuon\b',
        r'muon[- ]pair',
        r'invariant mass',
        r'mass spectrum',
        r'\bspectrum\b.*\bmuon',
        r'\b30\s*gev\b',
        r'\bbump\b',
        r'\bpeak\b.*\b(mass|spectrum|gev)',
        r'opposite charge.*muon',
        r'require both muons',
        r'cms.*2012.*muon',
        r'particle signal or selection',
        r'selection effect',
    )
    return any(re.search(p, q) for p in patterns)


def interpret_investigation_query(query: str, spec: dict | None = None) -> dict:
    """Return {action, message, spec?} matching the /suggest contract."""
    base = recipe.validate_spec(spec or {})
    q = (query or '').strip().lower()
    if not q:
        raise ValueError('Enter a request.')
    energy = re.search(r'(\d+(?:\.\d+)?)\s*tev', q)
    if energy and float(energy.group(1)) != 8:
        return {
            'action': 'unsupported',
            'message': (
                'This investigation uses CMS 2012 data at 8 TeV. Use Search & explain to find another energy; '
                'the sample will not be silently changed.'
            ),
        }
    unavailable = re.search(
        r'\b(?:require|select|filter|cut|apply|change|set|use)\b.*\b(?:isolat\w*|trigger(?: bits?)?|detector hits?|luminosity)\b',
        q,
    )
    if unavailable:
        return {
            'action': 'unsupported',
            'message': (
                'That selection is not available in this reduced sample. It retains muon pT, η, φ, mass and charge, '
                'but not isolation, trigger bits, raw detector hits or luminosity. Use Search & explain to find a richer '
                'CERN format; Beamline will not invent the missing field.'
            ),
        }
    if re.search(r'\b(higgs|discover|discovery|new particle|significance|prove)\b', q):
        return {
            'action': 'evidence',
            'message': (
                'A peak alone does not establish a new particle. Inspect the calculation and the reference explanation; '
                'this preview does not estimate discovery significance.'
            ),
        }
    if re.search(r'\b(why|explain|trigger|bump|peak|resonance)\b', q):
        return {
            'action': 'evidence',
            'message': (
                'The reference analysis documents a trigger-related feature around 30 GeV. That is a published explanation, '
                'not a cause inferred from changing these controls.'
            ),
        }
    updated = dict(base)
    changes: list[str] = []
    if re.search(r'\b(reset|original|baseline)\b', q):
        updated = dict(recipe.DEFAULT_SPEC)
        changes.append('Return to the reference selection.')
    charge = re.search(r'\b(same|opposite|any)[ -]charges?\b', q)
    if charge:
        updated['charge'] = charge.group(1)
        changes.append(f"Select {charge.group(1)} charges.")
    elif re.search(r'\bsame[- ]sign\b', q):
        updated['charge'] = 'same'
        changes.append('Select same charges.')
    elif re.search(r'\bopposite[- ]sign\b', q):
        updated['charge'] = 'opposite'
        changes.append('Select opposite charges.')
    momentum = re.search(r'need at least\s+(\d+(?:\.\d+)?)\s*(?:gev)?', q)
    if not momentum:
        momentum = re.search(
            r'(?:above|over|at least|minimum|pt\s*(?:>|>=|=)?|momentum(?:\s+to)?)\s*(\d+(?:\.\d+)?)\s*(?:gev)?',
            q,
        )
    if momentum:
        updated['min_pt'] = float(momentum.group(1))
        changes.append(f"Require both muons to have pT ≥ {updated['min_pt']:g} GeV.")
    elif re.search(r'\b(harder|harder cuts|stricter|tighten|higher momentum)\b', q):
        updated['min_pt'] = min(50.0, max(10.0, float(base.get('min_pt', 0)) + 5.0))
        changes.append(f"Raise the minimum pT to {updated['min_pt']:g} GeV for both muons.")
    eta = re.search(r'(?:eta|acceptance)\s*(?:below|under|<|<=|=|to)?\s*(\d+(?:\.\d+)?)', q)
    if eta:
        updated['max_abs_eta'] = float(eta.group(1))
        changes.append(f"Require both muons to have |η| ≤ {updated['max_abs_eta']:g}.")
    if not changes:
        return {
            'action': 'unsupported',
            'message': (
                'This first investigation supports muon momentum, charge and acceptance. Try “both muons above 10 GeV”, '
                '“same charge”, or use Search & explain for broader questions.'
            ),
        }
    updated = recipe.validate_spec(updated)
    return {
        'action': 'selection',
        'spec': updated,
        'message': ' '.join(changes) + ' Review the controls, then run the selection.',
    }
