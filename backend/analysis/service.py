"""Investigation API. Computes only bounded, pre-staged arrays; never executes model code."""
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import io
import json
from pathlib import Path
import re
import sqlite3
import time
import zipfile

import numpy as np
from flask import Blueprint, Response, current_app, jsonify, request, send_file, stream_with_context

from . import evidence_map, export_render, jobs, recipe, schemas, validate

bp = Blueprint('investigations', __name__, url_prefix='/api/investigations')
DEFAULT_DIRECTORY = Path(__file__).resolve().parent.parent / 'data' / 'dimuon'
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


def materialize(spec):
    started = time.monotonic()
    data, manifest = sample()
    recipe_hash = hashlib.sha256(Path(recipe.__file__).read_bytes()).hexdigest()
    key = json.dumps({'spec': spec, 'sample': manifest['sha256'], 'recipe': recipe_hash}, sort_keys=True)
    run_id = hashlib.sha256(key.encode()).hexdigest()[:20]
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


@bp.get('/status')
def status():
    try:
        _, manifest = sample()
    except FileNotFoundError as exc:
        return jsonify(ready=False, message=str(exc), sources=SOURCES)
    baseline = materialize(recipe.DEFAULT_SPEC)
    return jsonify(
        ready=True,
        manifest=manifest,
        defaults=recipe.DEFAULT_SPEC,
        sources=SOURCES,
        scope='CMS 2012 reduced muons, 8 TeV',
        constraints=schemas.DEFAULT_CONSTRAINTS,
        evidence_labels=schemas.EVIDENCE_LABELS,
        goal=schemas.DEFAULT_GOAL,
        variable_docs=evidence_map.for_entry(),
        reference_validation=validate.reference_feature_report(baseline['histogram']),
        baseline_run_id=baseline['id'],
    )


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
    if not isinstance(body, dict) or set(body) - {'goal', 'spec', 'constraints', 'active_run_id', 'baseline_run_id', 'run_ids'}:
        raise ValueError('Provide investigation fields only.')
    spec = recipe.validate_spec(body.get('spec', {}))
    record = schemas.investigation_record(
        _investigation_id(), spec, goal=body.get('goal'), constraints=body.get('constraints'),
        active_run_id=body.get('active_run_id'), baseline_run_id=body.get('baseline_run_id'),
        run_ids=body.get('run_ids'), updated_at=datetime.now(timezone.utc).isoformat(),
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


@bp.get('/variables/docs')
def variable_docs():
    return jsonify(evidence_map.for_entry())


@bp.put('/sessions/<investigation_id>')
def save_session(investigation_id):
    existing = find_investigation(investigation_id)
    if not existing:
        return jsonify(error='Investigation not found.'), 404
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) - {'goal', 'spec', 'constraints', 'active_run_id', 'baseline_run_id', 'run_ids'}:
        raise ValueError('Provide investigation fields only.')
    spec = recipe.validate_spec(body.get('spec', existing['spec']))
    record = schemas.investigation_record(
        investigation_id, spec, goal=body.get('goal', existing['goal']),
        constraints=body.get('constraints', existing['constraints']),
        active_run_id=body.get('active_run_id', existing['active_run_id']),
        baseline_run_id=body.get('baseline_run_id', existing['baseline_run_id']),
        run_ids=body.get('run_ids', existing['run_ids']),
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


def execute_job(spec):
    db = connection()
    try:
        job_id = jobs.create(db, spec)
        jobs.update(db, job_id, status='running')
    finally:
        db.close()
    try:
        result = materialize(spec)
    except Exception as exc:
        db = connection()
        try:
            jobs.update(db, job_id, status='failed', error=str(exc))
        finally:
            db.close()
        raise
    db = connection()
    try:
        jobs.update(db, job_id, status='complete', run_id=result['id'])
        payload = jobs.get(db, job_id)
    finally:
        db.close()
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
    if not isinstance(body, dict) or set(body) - {'spec'}:
        raise ValueError('Provide an object containing analysis spec only.')
    spec = recipe.validate_spec(body.get('spec', {}))

    def gen():
        yield _sse({'type': 'status', 'step': 'queued', 'label': 'Analysis queued'})
        db = connection()
        try:
            job_id = jobs.create(db, spec)
            jobs.update(db, job_id, status='queued')
        finally:
            db.close()
        yield _sse({'type': 'status', 'step': 'running', 'label': 'Computing from staged CERN sample', 'job_id': job_id})
        try:
            db = connection()
            try:
                jobs.update(db, job_id, status='running')
            finally:
                db.close()
            result = materialize(spec)
            db = connection()
            try:
                jobs.update(db, job_id, status='complete', run_id=result['id'])
                payload = jobs.get(db, job_id)
            finally:
                db.close()
            yield _sse({'type': 'result', 'job_id': job_id, 'job': payload, 'run': result})
        except Exception as exc:
            db = connection()
            try:
                jobs.update(db, job_id, status='failed', error=str(exc))
            finally:
                db.close()
            yield _sse({'type': 'error', 'job_id': job_id, 'error': str(exc)})

    return Response(
        stream_with_context(gen()),
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
    query = body['query'].strip().lower()
    if not query:
        raise ValueError('Enter a request.')
    energy = re.search(r'(\d+(?:\.\d+)?)\s*tev', query)
    if energy and float(energy[1]) != 8:
        return jsonify(action='unsupported', message='This investigation uses CMS 2012 data at 8 TeV. Use Search & explain to find another energy; the sample will not be silently changed.')
    unavailable = re.search(
        r'\b(?:require|select|filter|cut|apply|change|set|use)\b.*\b(?:isolat\w*|trigger(?: bits?)?|detector hits?|luminosity)\b',
        query,
    )
    if unavailable:
        return jsonify(
            action='unsupported',
            message='That selection is not available in this reduced sample. It retains muon pT, η, φ, mass and charge, but not isolation, trigger bits, raw detector hits or luminosity. Use Search & explain to find a richer CERN format; Beamline will not invent the missing field.',
        )
    if re.search(r'\b(higgs|discover|discovery|new particle|significance|prove)\b', query):
        return jsonify(action='evidence', message='A peak alone does not establish a new particle. Inspect the calculation and the reference explanation; this preview does not estimate discovery significance.')
    if re.search(r'\b(why|explain|trigger|bump|peak)\b', query):
        return jsonify(action='evidence', message='The reference analysis documents a trigger-related feature around 30 GeV. That is a published explanation, not a cause inferred from changing these controls.')
    updated = dict(spec)
    changes = []
    if re.search(r'\b(reset|original|baseline)\b', query):
        updated = dict(recipe.DEFAULT_SPEC)
        changes.append('Return to the reference selection.')
    charge = re.search(r'\b(same|opposite|any)[ -]charges?\b', query)
    if charge:
        updated['charge'] = charge[1]
        changes.append(f"Select {charge[1]} charges.")
    momentum = re.search(r'(?:above|over|at least|minimum|pt\s*(?:>|>=|=)?|momentum(?:\s+to)?)\s*(\d+(?:\.\d+)?)\s*(?:gev)?', query)
    if momentum:
        updated['min_pt'] = float(momentum[1])
        changes.append(f"Require both muons to have pT ≥ {updated['min_pt']:g} GeV.")
    elif re.search(r'\b(harder|harder cuts|stricter|tighten|higher momentum)\b', query):
        updated['min_pt'] = min(50.0, max(10.0, float(spec.get('min_pt', 0)) + 5.0))
        changes.append(f"Raise the minimum pT to {updated['min_pt']:g} GeV for both muons.")
    eta = re.search(r'(?:eta|acceptance)\s*(?:below|under|<|<=|=|to)?\s*(\d+(?:\.\d+)?)', query)
    if eta:
        updated['max_abs_eta'] = float(eta[1])
        changes.append(f"Require both muons to have |η| ≤ {updated['max_abs_eta']:g}.")
    if not changes:
        return jsonify(action='unsupported', message='This first investigation supports muon momentum, charge and acceptance. Try “both muons above 10 GeV”, “same charge”, or use Search & explain for broader questions.')
    updated = recipe.validate_spec(updated)
    return jsonify(action='selection', spec=updated, message=' '.join(changes) + ' Review the controls, then run the selection.')


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
    provenance = {
        'schema': 'beamline-investigation-export/v1',
        'run_id': run_id,
        'created_at': payload['created_at'],
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'sample_sha256': manifest['sha256'],
        'recipe_sha256': payload['recipe_sha256'],
        'source_record': manifest['record_url'],
        'source_doi': manifest['doi'],
        'sources': [{'title': source['title'], 'url': source['url']} for source in SOURCES],
        'scope': manifest['scope'],
        'sampling': manifest['sampling'],
        'scientific_limit': 'Reproduction verifies computation and provenance; it does not establish discovery significance.',
    }
    histogram = payload['histogram']
    files = {
        'manifest.json': json.dumps(manifest, indent=2).encode(),
        'analysis.json': json.dumps(payload['spec'], indent=2).encode(),
        'result.json': json.dumps(payload, indent=2).encode(),
        'sources.json': json.dumps(SOURCES, indent=2).encode(),
        'provenance.json': json.dumps(provenance, indent=2).encode(),
        'investigation.ipynb': json.dumps(notebook, indent=2).encode(),
        'recipe.py': recipe_bytes,
        'reproduce.py': replay.encode(),
        'requirements.txt': f'numpy=={np.__version__}\nmatplotlib==3.10.8\n'.encode(),
        'README.md': ('# Reproduce this investigation\n\nExtract all files. Create a Python environment.\n'
                      'Run `sha256sum -c SHA256SUMS`, then `pip install -r requirements.txt` and '
                      '`python reproduce.py`. Open investigation.ipynb to draw the plot.\n\n' +
                      manifest['scope'] + '\n' + manifest['sampling'] +
                      '\n\nHashes identify inputs; they do not certify a scientific conclusion.\n').encode(),
        'histogram.csv': ('low_gev,high_gev,events\n' + ''.join(
            f'{histogram["edges"][i]},{histogram["edges"][i+1]},{n}\n'
            for i, n in enumerate(histogram['counts']))).encode(),
    }
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
