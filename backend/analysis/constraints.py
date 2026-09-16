"""Parse dataset constraints from natural language; never silently relax execution."""
import re

from . import adapters, schemas

EXECUTABLE = schemas.DEFAULT_CONSTRAINTS


def parse_request(query: str) -> dict:
    q = (query or '').lower()
    energy = None
    match = re.search(r'(\d+(?:\.\d+)?)\s*tev', q)
    if match:
        energy = float(match.group(1))
    experiment = 'CMS' if re.search(r'\bcms\b', q) else ('ATLAS' if re.search(r'\batlas\b', q) else None)
    objects = 'muons' if 'muon' in q else None
    collision = 'pp' if re.search(r'proton[- ]proton|pp collision', q) else None
    return {
        'requested_energy_tev': energy,
        'experiment': experiment,
        'objects': objects,
        'collision': collision,
    }


def _record_energy(record: dict) -> float | None:
    text = ' '.join(
        str(record.get(key, '') or '')
        for key in ('collision_energy', 'title', 'abstract')
    ).lower()
    match = re.search(r'(\d+(?:\.\d+)?)\s*tev', text)
    return float(match.group(1)) if match else None


def _fit_record(record: dict, requested: dict, executable: dict) -> str:
    recid = str(record.get('recid'))
    if recid == str(executable['record_id']):
        return 'executable_sample'
    adapter = adapters.for_record(recid)
    if adapter and adapter.get('status') == 'catalog_only':
        return 'catalog_only_adapter'
    energy = _record_energy(record)
    if requested.get('requested_energy_tev') and energy:
        if abs(energy - requested['requested_energy_tev']) < 0.01:
            return 'exact_energy'
        return 'different_energy'
    return 'catalog_match'


def enrich_search(query: str, payload: dict) -> dict:
    requested = parse_request(query)
    executable = dict(EXECUTABLE)
    notes: list[str] = []
    binding = {
        'available': True,
        'record_id': executable['record_id'],
        'energy_tev': executable['energy_tev'],
        'recipe': executable['recipe'],
    }
    match = 'catalog'

    req_energy = requested.get('requested_energy_tev')
    if req_energy is not None and abs(req_energy - executable['energy_tev']) > 0.01:
        binding['available'] = False
        match = 'energy_mismatch'
        notes.append(
            f"You asked for {req_energy:g} TeV. The runnable investigation is fixed to "
            f"{executable['energy_tev']:g} TeV CMS reduced muons (record {executable['record_id']}). "
            'Catalog results are shown without switching the analysis sample.'
        )
        if abs(req_energy - 13.0) < 0.01:
            notes.append(
                'CERN record 30555 (2016 DoubleMuon NanoAOD at 13 TeV) appears in catalog search, '
                'but there is no second runnable adapter in this release. Opening those files does not change the home spectrum.'
            )
    elif requested.get('experiment') and requested['experiment'] != executable['experiment']:
        match = 'experiment_mismatch'
        notes.append(
            f"You asked for {requested['experiment']}. The current analysis adapter is "
            f"{executable['experiment']} only. Use catalog results or open record {executable['record_id']} for the bounded run."
        )
    elif req_energy is not None and abs(req_energy - executable['energy_tev']) < 0.01:
        match = 'energy_match'
        notes.append(
            f"Catalog query matches {executable['energy_tev']:g} TeV. The home investigation uses record {executable['record_id']} when you run the spectrum."
        )

    results = payload.get('results') or []
    for record in results:
        record['constraint_fit'] = _fit_record(record, requested, executable)

    return {
        **payload,
        'constraints_requested': requested,
        'constraints_executable': executable,
        'investigation_binding': binding,
        'constraint_match': match,
        'constraint_notes': notes,
    }
