"""Shared test hooks for the investigation product."""
import os

import pytest

os.environ.setdefault('BEAMLINE_ANALYSIS_WORKER_SYNC', '1')


@pytest.fixture(autouse=True)
def investigation_worker_sync(monkeypatch):
    """Avoid background worker races across parallel tests (SQLite job queue)."""
    import analysis.service as svc

    original = svc.init_investigation_worker

    def _init(app):
        app.config.setdefault('ANALYSIS_WORKER_SYNC', True)
        return original(app)

    monkeypatch.setattr(svc, 'init_investigation_worker', _init)
