"""Background analysis worker: one queued job at a time."""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Callable

from . import jobs

log = logging.getLogger('analysis.worker')


class AnalysisWorker:
    def __init__(self):
        self._app = None
        self._connection: Callable | None = None
        self._materialize: Callable | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def start(self, app, connection_factory, materialize_fn):
        with self._lock:
            self._app = app
            self._connection = connection_factory
            self._materialize = materialize_fn
            if self._thread and self._thread.is_alive():
                return
            self._thread = threading.Thread(target=self._loop, name='beamline-analysis-worker', daemon=True)
            self._thread.start()
            workers = int(os.environ.get('GUNICORN_WORKERS', '1'))
            if workers > 1:
                log.warning(
                    'GUNICORN_WORKERS=%s: each process runs an analysis thread; use 1 worker for SQLite job queue.',
                    workers,
                )
            log.info('analysis worker started')

    def _loop(self):
        while True:
            time.sleep(0.2)
            if not self._app or not self._connection or not self._materialize:
                continue
            with self._app.app_context():
                try:
                    self._process_one()
                except Exception:
                    log.exception('analysis worker tick failed')

    def _process_one(self):
        db = self._connection()
        try:
            claimed = jobs.claim_next(db)
        finally:
            db.close()
        if not claimed:
            return
        job_id, spec = claimed
        try:
            result = self._materialize(spec)
            db = self._connection()
            try:
                jobs.update(db, job_id, status='complete', run_id=result['id'])
            finally:
                db.close()
        except Exception as exc:
            db = self._connection()
            try:
                jobs.update(db, job_id, status='failed', error=str(exc))
            finally:
                db.close()


worker = AnalysisWorker()


def wait_for_job(connection_factory, job_id: str, timeout: float = 120.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        db = connection_factory()
        try:
            payload = jobs.get(db, job_id)
        finally:
            db.close()
        if not payload:
            raise ValueError('Analysis job not found.')
        if payload['status'] == 'complete':
            return payload
        if payload['status'] == 'failed':
            raise RuntimeError(payload.get('error') or 'Analysis job failed.')
        time.sleep(0.2)
    raise TimeoutError('Analysis job timed out.')
