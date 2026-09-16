"""Investigation API. Computes only bounded, pre-staged arrays; never executes model code."""
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import os
import io
import json
from pathlib import Path
import re
import sqlite3
import time
import zipfile

import numpy as np
from flask import Blueprint, Response, current_app, jsonify, request, send_file, stream_with_context

from . import (
    adapters,
    claims,
    evidence_map,
    export_render,
    jobs,
    narrative,
    plan,
    product_summary,
    provenance,
    recipe,
    schemas,
    source_passages,
    validate,
    worker,
)

bp = Blueprint('investigations', __name__, url_prefix='/api/investigations')
ANALYSIS_DIR = Path(__file__).resolve().parent
DEFAULT_DIRECTORY = ANALYSIS_DIR.parent / 'data' / 'dimuon'
PRODUCT_TARGETS_PATH = ANALYSIS_DIR / 'product_targets.json'
BASELINE_TIMINGS_PATH = ANALYSIS_DIR / 'baseline_timings.json'
PRODUCT_PHASE_PATH = ANALYSIS_DIR / 'product_phase.json'
BEGINNER_CHECKLIST_PATH = ANALYSIS_DIR / 'beginner_checklist.json'
EVAL_CASES_PATH = ANALYSIS_DIR / 'eval_cases.json'
SOURCES = [
    {'id': 'analysis', 'title': 'CMS dimuon spectrum: the documented trigger effect',
     'url': 'https://opendata.cern.ch/record/12342', 'kind': 'CERN documentation',
     'summary': 'The reference analysis identifies the feature around 30 GeV as an effect of event triggering, rather than a particle resonance.'},
    {'id': 'dataset', 'title': 'The reduced CMS muon dataset',
     'url': 'https://opendata.cern.ch/record/12341', 'kind': 'Dataset record',
     'summary': 'Reduced 2012 data retains muon kinematics and charge. The inputs used validated runs; the derived output received no further validation.'},
    {'id': 'recipe', 'title': 'ROOT reference calculation and selection',
     'url': 'https://root.cern/doc/master/df102__NanoAODDimuonAnalysis_8py_source.html',
     'kind': 'Reference implementation',
     'summary': 'Select exactly two oppositely charged muons and calculate their combined invariant mass. Beamline adds explicit, editable kinematic selections.'},
]


def directory():
    return Path(current_app.config.get('ANALYSIS_DIRECTORY', DEFAULT_DIRECTORY))


@lru_cache(maxsize=3)
def _load(path, digest):
    path = Path(path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError('Prepared sample checksum mismatch. Re-prepare the sample.')
    with np.load(path, allow_pickle=False) as archive:
        data = {k: archive[k] for k in ('pt', 'eta', 'phi', 'mass', 'charge', 'entry')}
    n = len(data['entry'])
    if not 0 < n <= 2_000_000 or any(data[k].shape != (n, 2) for k in ('pt', 'eta', 'phi', 'mass', 'charge')):
        raise ValueError('Invalid prepared sample dimensions.')
    for array in data.values():
        array.flags.writeable = False
    return data


def sample():
    path = directory() / 'manifest.json'
    if not path.exists():
        raise FileNotFoundError('The real-data sample is not prepared yet. Run python -m analysis.prepare on the server.')
    manifest = json.loads(path.read_text())
    if not re.fullmatch(r'sample-[a-f0-9]{16}\.npz', manifest['sample_file']):
        raise ValueError('Invalid sample filename.')
    return _load(str(directory() / manifest['sample_file']), manifest['sha256']), manifest


def connection():
    directory().mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(directory() / 'runs.sqlite3', timeout=10, isolation_level=None)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS investigations (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    jobs.ensure_table(db)
    return db


def find_run(run_id):
    if not re.fullmatch(r'[a-f0-9]{20}', run_id):
        return None
    with connection() as db:
        row = db.execute('SELECT payload FROM runs WHERE id=?', (run_id,)).fetchone()
    return json.loads(row[0]) if row else None


def resolve_baseline_run(manifest: dict | None = None) -> dict:
    if manifest is None:
        _, manifest = sample()
    run_id = recipe.deterministic_run_id(manifest, recipe.DEFAULT_SPEC)
    cached = find_run(run_id)
    if cached:
        return cached
    return materialize(recipe.DEFAULT_SPEC)


def materialize(spec):
    started = time.monotonic()
    data, manifest = sample()
    recipe_hash = hashlib.sha256(Path(recipe.__file__).read_bytes()).hexdigest()
    run_id = recipe.deterministic_run_id(manifest, spec)
    previous = find_run(run_id)
    if previous:
        return {**previous, 'cached': True}
    result = recipe.calculate(data, spec, manifest)
    payload = {**result, 'id': run_id, 'manifest': manifest, 'recipe_sha256': recipe_hash,
               'created_at': datetime.now(timezone.utc).isoformat(), 'cached': False,
               'compute_ms': round((time.monotonic() - started) * 1000), 'sources': SOURCES}
    with connection() as db:
        db.execute('INSERT OR IGNORE INTO runs VALUES (?,?)', (run_id, json.dumps(payload)))
    return payload


@bp.errorhandler(ValueError)
def invalid(error):
    return jsonify(error=str(error)), 400


@bp.errorhandler(FileNotFoundError)
def unavailable(error):
    return jsonify(error=str(error)), 503


@lru_cache(maxsize=1)
def _product_targets():
    if not PRODUCT_TARGETS_PATH.is_file():
        return {}
    return json.loads(PRODUCT_TARGETS_PATH.read_text(encoding='utf-8'))


@lru_cache(maxsize=1)
def _product_phase():
    if not PRODUCT_PHASE_PATH.is_file():
        return {}
    return json.loads(PRODUCT_PHASE_PATH.read_text(encoding='utf-8'))


@lru_cache(maxsize=1)
def _beginner_checklist_template():
    if not BEGINNER_CHECKLIST_PATH.is_file():
        return {'tasks': []}
    return json.loads(BEGINNER_CHECKLIST_PATH.read_text(encoding='utf-8'))


def _eval_case_count() -> int:
    if not EVAL_CASES_PATH.is_file():
        return 0
    payload = json.loads(EVAL_CASES_PATH.read_text(encoding='utf-8'))
    return len(payload.get('cases') or [])


def _beginner_sessions_path() -> Path:
    return directory() / 'beginner_sessions.json'


def _load_beginner_sessions() -> list:
    path = _beginner_sessions_path()
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return []
    return payload if isinstance(payload, list) else payload.get('sessions') or []


def _percentile(values, pct):
    if not values:
        return None
    idx = min(len(values) - 1, max(0, int(round((pct / 100) * (len(values) - 1)))))
    return values[idx]


def _product_gates(fresh_stats: dict, targets: dict) -> dict:
    p50 = fresh_stats.get('p50')
    p95 = fresh_stats.get('p95')
    p50_target = targets.get('fresh_compute_p50_ms')
    p95_target = targets.get('fresh_compute_p95_ms')
    return {
        'fresh_compute_p50_within_target': (
            p50 is not None and p50_target is not None and p50 <= p50_target
        ),
        'fresh_compute_p95_within_target': (
            p95 is not None and p95_target is not None and p95 <= p95_target
        ),
    }


@bp.get('/metrics')
def investigation_metrics():
    timings = []
    with connection() as db:
        rows = db.execute('SELECT payload FROM runs').fetchall()
    for row in rows:
        payload = json.loads(row[0])
        ms = payload.get('compute_ms')
        if ms is None:
            continue
        timings.append({
            'run_id': payload.get('id'),
            'compute_ms': ms,
            'cached': bool(payload.get('cached')),
            'selected_events': payload.get('selected_events'),
            'created_at': payload.get('created_at'),
        })
    timings.sort(key=lambda item: item.get('created_at') or '', reverse=True)
    recent = timings[:25]
    fresh = [item['compute_ms'] for item in recent if not item['cached']]
    fresh.sort()
    fresh_stats = {
        'count': len(fresh),
        'p50': _percentile(fresh, 50),
        'p95': _percentile(fresh, 95),
        'max': fresh[-1] if fresh else None,
    }
    targets = _product_targets()
    baseline_snapshot = None
    if BASELINE_TIMINGS_PATH.is_file():
        try:
            baseline_snapshot = json.loads(BASELINE_TIMINGS_PATH.read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            baseline_snapshot = {'error': 'invalid baseline_timings.json'}

    with connection() as db:
        queue = jobs.queue_stats(db)
    return jsonify(
        recent_runs=recent,
        fresh_compute_ms=fresh_stats,
        cached_runs=sum(1 for item in recent if item['cached']),
        job_queue=queue,
        worker_mode='sync' if _worker_sync_enabled(current_app) else 'background',
        product_targets=targets or None,
        product_gates=_product_gates(fresh_stats, targets) if targets else None,
        baseline_timings=baseline_snapshot,
    )


@bp.get('/product-summary')
def investigation_product_summary():
    """One JSON blob for judges, CI, and README health links."""
    try:
        _, manifest = sample()
        sample_ready = True
        baseline = resolve_baseline_run(manifest)
        inv_status = {
            'ready': True,
            'day_one_gate': validate.day_one_gate(baseline['histogram'], entries_read=manifest.get('entries_read')),
            'beginner_sessions_recorded': len(_load_beginner_sessions()),
        }
    except FileNotFoundError as exc:
        sample_ready = False
        inv_status = {'ready': False, 'message': str(exc)}
    return jsonify(product_summary.build(sample_ready=sample_ready, investigation_status=inv_status))


@bp.get('/status')
def status():
    try:
        _, manifest = sample()
    except FileNotFoundError as exc:
        return jsonify(ready=False, message=str(exc), sources=SOURCES)
    baseline = resolve_baseline_run(manifest)
    return jsonify(
        ready=True,
        manifest=manifest,
        defaults=recipe.DEFAULT_SPEC,
        sources=merged_sources(cached_verbatim=True),
        scope='CMS 2012 reduced muons, 8 TeV',
        constraints=schemas.DEFAULT_CONSTRAINTS,
        evidence_labels=schemas.EVIDENCE_LABELS,
        goal=schemas.DEFAULT_GOAL,
        variable_docs=evidence_map.for_entry(),
        reference_validation=validate.reference_feature_report(baseline['histogram']),
        day_one_gate=validate.day_one_gate(baseline['histogram'], entries_read=manifest.get('entries_read')),
        baseline_run_id=baseline['id'],
        adapters=[dict(item) for item in adapters.list_adapters()],
        executable_adapter=adapters.executable_binding(),
        product_phase=_product_phase(),
        eval_cases_frozen=_eval_case_count(),
        beginner_checklist=_beginner_checklist_template().get('tasks') or [],
        beginner_sessions_recorded=len(_load_beginner_sessions()),
    )


def merged_sources(*, cached_verbatim: bool = False):
    merged = [{**source, 'verbatim': False} for source in SOURCES]
    passages = (
        source_passages.bundle_cached(directory())
        if cached_verbatim
        else source_passages.bundle(directory())
    )
    for item in passages:
        merged.append({
            'id': f"record-{item['id']}",
            'title': item['title'],
            'url': item['url'],
            'kind': item['kind'],
            'summary': item['text'][:320] + ('…' if len(item['text']) > 320 else ''),
            'excerpt': item['text'][:1200] + ('…' if len(item['text']) > 1200 else ''),
            'verbatim': True,
            'sha256': item['sha256'],
            'fetched_at': item['fetched_at'],
        })
    return merged


SESSION_FIELDS = {'goal', 'spec', 'constraints', 'active_run_id', 'baseline_run_id', 'run_ids', 'pending_job_id'}


def _worker_sync_enabled(app) -> bool:
    if app.config.get('ANALYSIS_WORKER_SYNC') is not None:
        return bool(app.config['ANALYSIS_WORKER_SYNC'])
    return os.environ.get('BEAMLINE_ANALYSIS_WORKER_SYNC', '').lower() in ('1', 'true', 'yes')


def init_investigation_worker(app):
    import threading

    sync = _worker_sync_enabled(app)
    worker.worker.start(app, connection, materialize, sync=sync)

    def warm_baseline():
        with app.app_context():
            try:
                materialize(recipe.DEFAULT_SPEC)
            except Exception:
                current_app.logger.exception('baseline warm-up failed')

    if sync:
        with app.app_context():
            try:
                materialize(recipe.DEFAULT_SPEC)
            except Exception:
                app.logger.exception('baseline warm-up failed')
    else:
        threading.Thread(target=warm_baseline, name='investigation-baseline-warm', daemon=True).start()


def compare_run_payload(run_id: str, baseline_id: str) -> dict:
    current = find_run(run_id)
    baseline = find_run(baseline_id)
    if not current or not baseline:
        raise ValueError('One or both investigation runs were not found.')
    if current['manifest']['sha256'] != baseline['manifest']['sha256']:
        raise ValueError('Runs use different prepared samples and cannot be compared.')
    hist_a = current['histogram']
    hist_b = baseline['histogram']
    if hist_a['edges'] != hist_b['edges']:
        raise ValueError('Histogram binning differs between runs.')
    bin_delta = [
        {
            'low': hist_a['edges'][i],
            'high': hist_a['edges'][i + 1],
            'current': hist_a['counts'][i],
            'baseline': hist_b['counts'][i],
            'delta': hist_a['counts'][i] - hist_b['counts'][i],
        }
        for i in range(len(hist_a['counts']))
    ]
    cutflow_b = {step['label']: step['count'] for step in baseline['cutflow']}
    cutflow_delta = [
        {
            'label': step['label'],
            'current': step['count'],
            'baseline': cutflow_b.get(step['label'], 0),
            'delta': step['count'] - cutflow_b.get(step['label'], 0),
        }
        for step in current['cutflow']
    ]
    return {
        'run_id': run_id,
        'baseline_run_id': baseline_id,
        'spec_current': current['spec'],
        'spec_baseline': baseline['spec'],
        'selected_events_delta': current['selected_events'] - baseline['selected_events'],
        'plotted_events_delta': current['plotted_events'] - baseline['plotted_events'],
        'histogram_delta': bin_delta,
        'cutflow_delta': cutflow_delta,
    }


def enqueue_job(spec):
    db = connection()
    try:
        job_id = jobs.create(db, spec)
    finally:
        db.close()
    if _worker_sync_enabled(current_app):
        worker.worker.process_job(job_id)
    return job_id


def _investigation_id():
    return hashlib.sha256(f'{time.time_ns()}'.encode()).hexdigest()[:20]


def find_investigation(investigation_id):
    if not re.fullmatch(r'[a-f0-9]{20}', investigation_id):
        return None
    with connection() as db:
        row = db.execute('SELECT payload FROM investigations WHERE id=?', (investigation_id,)).fetchone()
    return json.loads(row[0]) if row else None


def store_investigation(record):
    with connection() as db:
        db.execute('INSERT OR REPLACE INTO investigations VALUES (?,?)', (record['id'], json.dumps(record)))
    return record


@bp.post('/sessions')
def create_session():
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict) or set(body) - SESSION_FIELDS:
        raise ValueError('Provide investigation fields only.')
    spec = recipe.validate_spec(body.get('spec', {}))
    record = schemas.investigation_record(
        _investigation_id(), spec, goal=body.get('goal'), constraints=body.get('constraints'),
        active_run_id=body.get('active_run_id'), baseline_run_id=body.get('baseline_run_id'),
        run_ids=body.get('run_ids'), pending_job_id=body.get('pending_job_id'),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    if record['active_run_id'] and not find_run(record['active_run_id']):
        raise ValueError('Active run was not found.')
    return jsonify(store_investigation(record)), 201


@bp.get('/sessions/<investigation_id>')
def session_detail(investigation_id):
    payload = find_investigation(investigation_id)
    return (jsonify(payload), 200) if payload else (jsonify(error='Investigation not found.'), 404)


@bp.get('/sessions/<investigation_id>/restore')
def restore_session(investigation_id):
    payload = find_investigation(investigation_id)
    if not payload:
        return jsonify(error='Investigation not found.'), 404
    runs = []
    seen = set()
    for run_id in list(payload.get('run_ids') or []) + [payload.get('active_run_id'), payload.get('baseline_run_id')]:
        if not run_id or run_id in seen:
            continue
        seen.add(run_id)
        run_payload = find_run(run_id)
        if run_payload:
            runs.append(run_payload)
    return jsonify({**payload, 'runs': runs})


@bp.get('/sessions/<investigation_id>/brief')
def session_brief(investigation_id):
    payload = find_investigation(investigation_id)
    if not payload:
        return jsonify(error='Investigation not found.'), 404
    runs = []
    seen = set()
    for run_id in list(payload.get('run_ids') or []) + [payload.get('active_run_id'), payload.get('baseline_run_id')]:
        if not run_id or run_id in seen:
            continue
        seen.add(run_id)
        run_payload = find_run(run_id)
        if run_payload:
            runs.append(run_payload)
    active = find_run(payload.get('active_run_id')) if payload.get('active_run_id') else None
    baseline = find_run(payload.get('baseline_run_id')) if payload.get('baseline_run_id') else None
    comparison = None
    claims_payload = []
    narrative_payload = None
    if active:
        ref_val = validate.reference_feature_report(active['histogram'])
        comparison = None
        if baseline and active['id'] != baseline['id']:
            try:
                comparison = compare_run_payload(active['id'], baseline['id'])
                narrative_payload = narrative.revision_narrative(comparison)
            except ValueError:
                comparison = None
        claims_payload = claims.build_claims(
            active,
            baseline=baseline if comparison else None,
            comparison=comparison,
            reference_validation=ref_val,
            sources=merged_sources(cached_verbatim=True),
        )
    pending_job = None
    if payload.get('pending_job_id'):
        with connection() as db:
            pending_job = jobs.get(db, payload['pending_job_id'])
    return jsonify(
        session=payload,
        runs=runs,
        active_run=active,
        baseline_run=baseline,
        comparison=comparison,
        narrative=narrative_payload,
        claims=claims_payload,
        pending_job=pending_job,
        status={
            'sample_ready': True,
            'reference_validation': validate.reference_feature_report(active['histogram']) if active else None,
        },
    )


@bp.get('/runs/<run_id>/provenance')
def run_provenance(run_id):
    payload = find_run(run_id)
    if not payload:
        return jsonify(error='Investigation run not found.'), 404
    return jsonify(provenance.run_lineage(payload))


@bp.get('/variables/docs')
def variable_docs():
    return jsonify(evidence_map.for_entry())


@bp.get('/adapters/<recid>')
def adapter_detail(recid):
    adapter = adapters.for_record(recid)
    if not adapter:
        return jsonify(error=f'No adapter metadata for record {recid}.'), 404
    payload = dict(adapter)
    if str(recid) == '30555':
        payload['certified_run_requirement'] = (
            'NanoAOD inputs must be filtered with the CMS certified run/luminosity mask; '
            'raw files are not pre-filtered to valid run segments.'
        )
        payload['runnable_in_this_release'] = False
        payload['execution_blockers'] = adapter.get('execution_blockers') or []
        payload['roadmap'] = adapter.get('roadmap')
    elif str(recid) == adapters.EXECUTABLE['record_id']:
        payload['runnable_in_this_release'] = True
    return jsonify(payload)


@bp.post('/sources/refresh')
def refresh_sources():
    refreshed = []
    errors = []
    for recid in source_passages.RECORDS:
        try:
            refreshed.append(source_passages.load_or_fetch(directory(), recid, force=True))
        except Exception as exc:
            errors.append({'id': recid, 'error': str(exc)})
    return jsonify(refreshed=refreshed, errors=errors, sources=merged_sources(cached_verbatim=True))


@bp.get('/beginner-checklist')
def beginner_checklist():
    template = _beginner_checklist_template()
    return jsonify(
        tasks=template.get('tasks') or [],
        sessions=_load_beginner_sessions(),
        description=template.get('description'),
    )


@bp.post('/beginner-checklist/sessions')
def record_beginner_session():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValueError('Provide a session object with task results.')
    tester = (body.get('tester') or '').strip()
    if not tester or len(tester) > 120:
        raise ValueError('Provide a short tester label (who ran the checklist).')
    results = body.get('results')
    if not isinstance(results, list) or not results:
        raise ValueError('Provide results: [{task_id, completed, notes}]')
    allowed_ids = {task['id'] for task in _beginner_checklist_template().get('tasks') or []}
    cleaned = []
    for row in results:
        if not isinstance(row, dict):
            continue
        task_id = row.get('task_id')
        if task_id not in allowed_ids:
            continue
        cleaned.append({
            'task_id': task_id,
            'completed': bool(row.get('completed')),
            'notes': str(row.get('notes') or '')[:2000],
        })
    if not cleaned:
        raise ValueError('No valid task results were provided.')
    entry = {
        'id': hashlib.sha256(f'{time.time_ns()}:{tester}'.encode()).hexdigest()[:16],
        'tester': tester,
        'recorded_at': datetime.now(timezone.utc).isoformat(),
        'results': cleaned,
        'confusion_notes': str(body.get('confusion_notes') or '')[:4000],
    }
    sessions = _load_beginner_sessions()
    sessions.append(entry)
    path = _beginner_sessions_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sessions, indent=2) + '\n', encoding='utf-8')
    return jsonify(entry=entry, sessions_recorded=len(sessions))


@bp.put('/sessions/<investigation_id>')
def save_session(investigation_id):
    existing = find_investigation(investigation_id)
    if not existing:
        return jsonify(error='Investigation not found.'), 404
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) - SESSION_FIELDS:
        raise ValueError('Provide investigation fields only.')
    spec = recipe.validate_spec(body.get('spec', existing['spec']))
    pending = body.get('pending_job_id', existing.get('pending_job_id'))
    if pending is not None and pending != existing.get('pending_job_id'):
        with connection() as db:
            job_payload = jobs.get(db, pending)
        if not job_payload:
            raise ValueError('Pending analysis job was not found.')
    record = schemas.investigation_record(
        investigation_id, spec, goal=body.get('goal', existing['goal']),
        constraints=body.get('constraints', existing['constraints']),
        active_run_id=body.get('active_run_id', existing['active_run_id']),
        baseline_run_id=body.get('baseline_run_id', existing['baseline_run_id']),
        run_ids=body.get('run_ids', existing['run_ids']),
        pending_job_id=pending,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    if record['active_run_id'] and not find_run(record['active_run_id']):
        raise ValueError('Active run was not found.')
    return jsonify(store_investigation(record))


@bp.post('/runs')
def run():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) - {'spec'}:
        raise ValueError('Provide an object containing analysis spec only.')
    spec = recipe.validate_spec(body.get('spec', {}))
    return jsonify(materialize(spec))


def _sse(event: dict) -> str:
    return f'data: {json.dumps(event, ensure_ascii=False)}\n\n'


def _job_event_stream(job_id: str, *, announce_queued: bool = False):
    if announce_queued:
        yield _sse({'type': 'status', 'step': 'queued', 'label': 'Analysis queued', 'job_id': job_id})
    seen_running = False
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        db = connection()
        try:
            payload = jobs.get(db, job_id)
        finally:
            db.close()
        if not payload:
            yield _sse({'type': 'error', 'job_id': job_id, 'error': 'Analysis job not found.'})
            return
        if payload['status'] == 'running' and not seen_running:
            seen_running = True
            yield _sse({'type': 'status', 'step': 'running', 'label': 'Computing from staged CERN sample', 'job_id': job_id})
        if payload['status'] == 'complete':
            run_payload = find_run(payload['run_id'])
            yield _sse({'type': 'result', 'job_id': job_id, 'job': payload, 'run': run_payload})
            return
        if payload['status'] == 'failed':
            yield _sse({'type': 'error', 'job_id': job_id, 'error': payload.get('error') or 'Analysis job failed.'})
            return
        if payload['status'] == 'queued' and not announce_queued and not seen_running:
            yield _sse({'type': 'status', 'step': 'queued', 'label': 'Analysis queued', 'job_id': job_id})
        time.sleep(0.2)
    yield _sse({'type': 'error', 'job_id': job_id, 'error': 'Analysis job timed out.'})


def execute_job(spec):
    job_id = enqueue_job(spec)
    payload = worker.wait_for_job(connection, job_id)
    result = find_run(payload['run_id'])
    return job_id, payload, result


@bp.post('/jobs')
def submit_job():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) - {'spec'}:
        raise ValueError('Provide an object containing analysis spec only.')
    spec = recipe.validate_spec(body.get('spec', {}))
    job_id, payload, result = execute_job(spec)
    return jsonify({**payload, 'run': result})


@bp.post('/jobs/stream')
def stream_job():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) - {'spec', 'job_id'}:
        raise ValueError('Provide analysis spec or an existing job_id.')
    job_id = body.get('job_id')
    if job_id:
        if not isinstance(job_id, str) or not re.fullmatch(r'[a-f0-9]{20}', job_id):
            raise ValueError('Provide a valid analysis job_id.')
        with connection() as db:
            existing = jobs.get(db, job_id)
        if not existing:
            return jsonify(error='Analysis job not found.'), 404

        def reconnect():
            yield from _job_event_stream(job_id, announce_queued=False)

        return _sse_response(reconnect)
    if 'spec' not in body:
        raise ValueError('Provide analysis spec or an existing job_id.')
    spec = recipe.validate_spec(body.get('spec', {}))

    def gen():
        new_job_id = enqueue_job(spec)
        yield from _job_event_stream(new_job_id, announce_queued=True)

    return _sse_response(gen)


@bp.get('/jobs/<job_id>/stream')
def stream_job_reconnect(job_id):
    if not re.fullmatch(r'[a-f0-9]{20}', job_id):
        return jsonify(error='Analysis job not found.'), 404
    with connection() as db:
        existing = jobs.get(db, job_id)
    if not existing:
        return jsonify(error='Analysis job not found.'), 404

    def reconnect():
        yield from _job_event_stream(job_id, announce_queued=False)

    return _sse_response(reconnect)


def _sse_response(generator):
    return Response(
        stream_with_context(generator()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive'},
    )


@bp.get('/jobs/<job_id>')
def job_detail(job_id):
    with connection() as db:
        payload = jobs.get(db, job_id)
    if not payload:
        return jsonify(error='Analysis job not found.'), 404
    if payload['run_id']:
        run_payload = find_run(payload['run_id'])
        if run_payload:
            payload = {**payload, 'run': run_payload}
    return jsonify(payload)


@bp.get('/runs/<run_id>')
def detail(run_id):
    payload = find_run(run_id)
    return (jsonify(payload), 200) if payload else (jsonify(error='Investigation run not found.'), 404)


@bp.get('/runs/<run_id>/entries')
def entries(run_id):
    payload = find_run(run_id)
    if not payload:
        return jsonify(error='Investigation run not found.'), 404
    try:
        bin_index = int(request.args.get('bin', ''))
    except (ValueError, TypeError):
        raise ValueError('Choose a histogram bin.')
    if not 0 <= bin_index < len(recipe.EDGES) - 1:
        raise ValueError('Histogram bin is outside the plotted range.')
    data, manifest = sample()
    if manifest['sha256'] != payload['manifest']['sha256']:
        return jsonify(error='This run uses a previous sample. Its entries are no longer loaded.'), 409
    selected, _ = recipe.select(data, payload['spec'])
    masses = recipe.invariant_mass(data)
    low, high = recipe.EDGES[bin_index:bin_index + 2]
    selected &= (masses >= low) & ((masses <= high) if bin_index == len(recipe.EDGES) - 2 else (masses < high))
    rows = np.flatnonzero(selected)
    events = [{'entry': int(data['entry'][i]), 'mass': float(masses[i]),
               'muons': [{k: float(data[k][i, j]) for k in ('pt', 'eta', 'phi', 'mass', 'charge')} for j in range(2)]}
              for i in rows[:8]]
    return jsonify(bin=bin_index, low=float(low), high=float(high), total=len(rows), entries=events,
                   identity=manifest['identity'], ordering='First eight matching source entries; not randomly sampled.')


@bp.post('/suggest')
def suggest():
    """Bounded language shortcuts. All changes remain visible before the user runs them."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not isinstance(body.get('query'), str) or len(body['query']) > 1000:
        raise ValueError('Enter an investigation request of at most 1,000 characters.')
    spec = recipe.validate_spec(body.get('spec', {}))
    return jsonify(plan.interpret_investigation_query(body['query'], spec))


@bp.get('/runs/<run_id>/compare')
def compare_runs(run_id):
    baseline_id = request.args.get('baseline')
    if not baseline_id:
        raise ValueError('Provide baseline run id as ?baseline=<run_id>.')
    try:
        return jsonify(compare_run_payload(run_id, baseline_id))
    except ValueError as exc:
        msg = str(exc)
        if 'not found' in msg:
            return jsonify(error=msg), 404
        return jsonify(error=msg), 409


@bp.get('/runs/<run_id>/claims')
def run_claims(run_id):
    payload = find_run(run_id)
    if not payload:
        return jsonify(error='Investigation run not found.'), 404
    baseline_id = request.args.get('baseline')
    baseline = find_run(baseline_id) if baseline_id else None
    comparison = None
    if baseline:
        try:
            comparison = compare_run_payload(run_id, baseline_id)
        except ValueError:
            comparison = None
    focus_bin = request.args.get('bin')
    try:
        focus_bin = int(focus_bin) if focus_bin is not None else None
    except (TypeError, ValueError):
        focus_bin = None
    ref_val = validate.reference_feature_report(payload['histogram'])
    return jsonify(
        run_id=run_id,
        claims=claims.build_claims(
            payload,
            baseline=baseline,
            comparison=comparison,
            reference_validation=ref_val,
            sources=merged_sources(cached_verbatim=True),
            focus_bin=focus_bin,
        ),
    )


@bp.get('/runs/<run_id>/narrative')
def run_narrative(run_id):
    baseline_id = request.args.get('baseline')
    if not baseline_id:
        raise ValueError('Provide baseline run id as ?baseline=<run_id>.')
    try:
        comparison = compare_run_payload(run_id, baseline_id)
    except ValueError as exc:
        msg = str(exc)
        if 'not found' in msg:
            return jsonify(error=msg), 404
        return jsonify(error=msg), 409
    return jsonify(narrative.revision_narrative(comparison))


@bp.get('/runs/<run_id>/export')
def export(run_id):
    payload = find_run(run_id)
    if not payload:
        return jsonify(error='Investigation run not found.'), 404
    _, manifest = sample()
    if manifest['sha256'] != payload['manifest']['sha256']:
        return jsonify(error='This run uses a previous sample. Export is unavailable.'), 409
    recipe_bytes = Path(recipe.__file__).read_bytes()
    if hashlib.sha256(recipe_bytes).hexdigest() != payload['recipe_sha256']:
        return jsonify(error='The recipe has changed since this run. Run the selection again before exporting.'), 409
    replay = '''from pathlib import Path
import hashlib, json
import numpy as np
from recipe import calculate

root = Path('.')
for line in (root / 'SHA256SUMS').read_text().splitlines():
    expected, name = line.split('  ', 1)
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    assert actual == expected, f'Checksum mismatch: {name}'
manifest = json.loads((root / 'manifest.json').read_text())
raw = (root / manifest['sample_file']).read_bytes()
assert hashlib.sha256(raw).hexdigest() == manifest['sha256'], 'Sample checksum mismatch'
with np.load(root / manifest['sample_file'], allow_pickle=False) as data:
    result = calculate(data, json.loads((root / 'analysis.json').read_text()), manifest)
expected = json.loads((root / 'result.json').read_text())
assert result['histogram'] == expected['histogram'], 'Histogram mismatch'
assert result['cutflow'] == expected['cutflow'], 'Selection-count mismatch'
print('Reproduced:', result['selected_events'], 'selected events')
'''
    notebook = {'nbformat': 4, 'nbformat_minor': 5, 'metadata': {
        'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'},
        'language_info': {'name': 'python'}}, 'cells': [
            {'cell_type': 'markdown', 'id': 'intro', 'metadata': {}, 'source': [
                '# Beamline · reproducible CMS investigation\n',
                'Extract the whole ZIP and open this notebook in that directory. Install requirements.txt first.\n',
                f"Source: {manifest['record_url']} · DOI {manifest['doi']}\n",
                manifest['sampling'] + '\n', manifest['scope']]},
            {'cell_type': 'code', 'id': 'reproduce', 'metadata': {}, 'execution_count': None, 'outputs': [], 'source': replay.splitlines(True)},
            {'cell_type': 'code', 'id': 'plot', 'metadata': {}, 'execution_count': None, 'outputs': [], 'source': [
                'import matplotlib.pyplot as plt\n',
                "plt.stairs(result['histogram']['counts'], result['histogram']['edges'])\n",
                "plt.xlabel('Muon-pair invariant mass (GeV)')\n",
                "plt.ylabel('Events / 1 GeV')\n", "plt.title('CMS open data · 2012 · 8 TeV · bounded sample')\n",
                "plt.savefig('spectrum.png', dpi=160, bbox_inches='tight')\n", 'plt.show()\n']}]}
    baseline_id = request.args.get('baseline')
    lineage = provenance.run_lineage(payload)
    provenance_doc = {
        'schema': 'beamline-investigation-export/v1',
        'run_id': run_id,
        'lineage': lineage,
        'created_at': payload['created_at'],
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'sample_sha256': manifest['sha256'],
        'recipe_sha256': payload['recipe_sha256'],
        'source_record': manifest['record_url'],
        'source_doi': manifest['doi'],
        'sources': [{'title': source['title'], 'url': source['url'], 'verbatim': source.get('verbatim', False)} for source in merged_sources()],
        'scope': manifest['scope'],
        'sampling': manifest['sampling'],
        'scientific_limit': 'Reproduction verifies computation and provenance; it does not establish discovery significance.',
    }
    if baseline_id:
        provenance_doc['baseline_run_id'] = baseline_id
    histogram = payload['histogram']
    ref_val = validate.reference_feature_report(histogram)
    export_claims = claims.build_claims(
        payload,
        reference_validation=ref_val,
        sources=merged_sources(cached_verbatim=True),
    )
    files = {
        'manifest.json': json.dumps(manifest, indent=2).encode(),
        'analysis.json': json.dumps(payload['spec'], indent=2).encode(),
        'result.json': json.dumps(payload, indent=2).encode(),
        'sources.json': json.dumps(merged_sources(), indent=2).encode(),
        'source_passages.json': json.dumps(source_passages.bundle(directory()), indent=2).encode(),
        'claims.json': json.dumps({'run_id': run_id, 'claims': export_claims}, indent=2).encode(),
        'run_provenance.json': json.dumps(lineage, indent=2).encode(),
        'provenance.json': json.dumps({**provenance_doc, 'claims_count': len(export_claims)}, indent=2).encode(),
        'investigation.ipynb': json.dumps(notebook, indent=2).encode(),
        'recipe.py': recipe_bytes,
        'reproduce.py': replay.encode(),
        'requirements.txt': Path(__file__).with_name('export_lock.txt').read_bytes(),
        'README.md': ('# Reproduce this investigation\n\nExtract all files. Create a Python environment.\n'
                      'Run `sha256sum -c SHA256SUMS`, then `pip install -r requirements.txt` and '
                      '`python reproduce.py`. Open investigation.ipynb to draw the plot.\n\n' +
                      manifest['scope'] + '\n' + manifest['sampling'] +
                      '\n\nHashes identify inputs; they do not certify a scientific conclusion.\n').encode(),
        'histogram.csv': ('low_gev,high_gev,events\n' + ''.join(
            f'{histogram["edges"][i]},{histogram["edges"][i+1]},{n}\n'
            for i, n in enumerate(histogram['counts']))).encode(),
    }
    if baseline_id:
        try:
            comparison = compare_run_payload(run_id, baseline_id)
            files['comparison.json'] = json.dumps(comparison, indent=2).encode()
            files['narrative.json'] = json.dumps(narrative.revision_narrative(comparison), indent=2).encode()
            baseline_run = find_run(baseline_id)
            if baseline_run:
                files['baseline_result.json'] = json.dumps(baseline_run, indent=2).encode()
        except ValueError:
            pass
    try:
        files['spectrum.png'] = export_render.spectrum_png(histogram)
    except Exception:
        pass
    checksums = {manifest['sample_file']: manifest['sha256']}
    checksums.update({name: hashlib.sha256(content).hexdigest() for name, content in files.items()})
    files['SHA256SUMS'] = ''.join(f'{digest}  {name}\n' for name, digest in sorted(checksums.items())).encode()

    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.write(directory() / manifest['sample_file'], manifest['sample_file'])
        for name, content in files.items():
            archive.writestr(name, content)
    stream.seek(0)
    return send_file(stream, mimetype='application/zip', as_attachment=True, download_name=f'beamline-{run_id}.zip')
