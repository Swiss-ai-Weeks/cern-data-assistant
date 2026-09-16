"""Single JSON snapshot for hackathon judges and CI gates."""
from __future__ import annotations

import json
import os
from pathlib import Path

from . import adapters, validate

ANALYSIS_DIR = Path(__file__).resolve().parent


def _read_json(name: str) -> dict | list | None:
    path = ANALYSIS_DIR / name
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return None


def build(*, sample_ready: bool, investigation_status: dict | None = None) -> dict:
    phase = _read_json('product_phase.json') or {}
    targets = _read_json('product_targets.json') or {}
    baseline = _read_json('baseline_timings.json')
    beginner_sessions = 0
    if investigation_status:
        beginner_sessions = int(investigation_status.get('beginner_sessions_recorded') or 0)
    gate = (investigation_status or {}).get('day_one_gate')
    return {
        'product': 'Beamline · CERN Data Assistant',
        'repository': 'https://github.com/Swiss-ai-Weeks/cern-data-assistant',
        'public_demo_url': os.environ.get('PUBLIC_DEMO_URL') or None,
        'license': 'MIT',
        'phase': phase,
        'feature_freeze_core': bool(phase.get('feature_freeze_core')),
        'eval_cases_frozen': len((_read_json('eval_cases.json') or {}).get('cases') or []),
        'product_targets': targets,
        'baseline_timings': baseline,
        'investigation': {
            'sample_ready': sample_ready,
            'executable_record': adapters.EXECUTABLE['record_id'],
            'stretch_catalog_record': adapters.STRETCH_CATALOG['record_id'],
            'day_one_gate_passed': bool(gate and gate.get('passed')),
            'day_one_gate': gate,
            'beginner_sessions_recorded': beginner_sessions,
        },
        'verification': {
            'product_checks': 'scripts/run_product_checks.sh',
            'ship': 'scripts/ship.sh',
            'ci': '.github/workflows/test.yml',
        },
        'beginner_checklist': '/api/investigations/beginner-checklist',
    }
