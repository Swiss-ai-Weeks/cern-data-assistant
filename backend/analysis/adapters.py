"""Dataset capability registry — what can run vs catalog-only."""
from __future__ import annotations

from . import schemas

EXECUTABLE = {
    'record_id': '12341',
    'title': 'CMS 2012 reduced muons (8 TeV)',
    'energy_tev': 8.0,
    'experiment': 'CMS',
    'format': 'reduced 2012 muon ntuple',
    'recipe': schemas.DEFAULT_CONSTRAINTS['recipe'],
    'status': 'executable',
    'variables': ['pt', 'eta', 'phi', 'mass', 'charge', 'entry'],
    'quality_note': (
        'Derived inputs used validated runs; the derived output received no further validation.'
    ),
    'record_url': 'https://opendata.cern.ch/record/12341',
}

STRETCH_CATALOG = {
    'record_id': '30555',
    'title': 'CMS 2016 DoubleMuon NanoAOD (13 TeV)',
    'energy_tev': 13.0,
    'experiment': 'CMS',
    'format': 'NanoAOD',
    'recipe': None,
    'status': 'catalog_only',
    'variables': [],
    'quality_note': (
        'Requires certified-run masks and NanoAOD fields not wired into the home investigation adapter.'
    ),
    'record_url': 'https://opendata.cern.ch/record/30555',
}

REGISTRY = {
    EXECUTABLE['record_id']: EXECUTABLE,
    STRETCH_CATALOG['record_id']: STRETCH_CATALOG,
}


def list_adapters() -> list[dict]:
    return [dict(EXECUTABLE), dict(STRETCH_CATALOG)]


def for_record(recid: str | int | None) -> dict | None:
    if recid is None:
        return None
    return REGISTRY.get(str(recid))


def executable_binding() -> dict:
    return {
        **schemas.DEFAULT_CONSTRAINTS,
        'adapter_status': EXECUTABLE['status'],
        'record_url': EXECUTABLE['record_url'],
        'quality_note': EXECUTABLE['quality_note'],
    }
