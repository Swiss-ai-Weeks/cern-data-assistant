"""SQLite-backed analysis jobs for reconnect after refresh."""
from datetime import datetime, timezone
import hashlib
import json
import sqlite3
import time


def ensure_table(db: sqlite3.Connection):
    db.execute(
        '''CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            spec TEXT NOT NULL,
            run_id TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )'''
    )


def new_id() -> str:
    return hashlib.sha256(f'job:{time.time_ns()}'.encode()).hexdigest()[:20]


def claim_next(db: sqlite3.Connection) -> tuple[str, dict] | None:
    ensure_table(db)
    db.execute('BEGIN IMMEDIATE')
    try:
        row = db.execute(
            "SELECT id, spec FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1"
        ).fetchone()
        if not row:
            db.execute('ROLLBACK')
            return None
        job_id = row[0]
        db.execute(
            "UPDATE jobs SET status='running', updated_at=? WHERE id=? AND status='queued'",
            (datetime.now(timezone.utc).isoformat(), job_id),
        )
        if db.total_changes == 0:
            db.execute('ROLLBACK')
            return None
        db.execute('COMMIT')
        return job_id, json.loads(row[1])
    except Exception:
        db.execute('ROLLBACK')
        raise


def create(db: sqlite3.Connection, spec: dict) -> str:
    ensure_table(db)
    job_id = new_id()
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        'INSERT INTO jobs VALUES (?,?,?,?,?,?,?)',
        (job_id, 'queued', json.dumps(spec), None, None, now, now),
    )
    return job_id


def update(db: sqlite3.Connection, job_id: str, *, status: str, run_id: str | None = None, error: str | None = None):
    ensure_table(db)
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        'UPDATE jobs SET status=?, run_id=?, error=?, updated_at=? WHERE id=?',
        (status, run_id, error, now, job_id),
    )


def queue_stats(db: sqlite3.Connection) -> dict:
    ensure_table(db)
    rows = db.execute('SELECT status, COUNT(*) FROM jobs GROUP BY status').fetchall()
    counts = {status: count for status, count in rows}
    return {
        'queued': int(counts.get('queued', 0)),
        'running': int(counts.get('running', 0)),
        'complete': int(counts.get('complete', 0)),
        'failed': int(counts.get('failed', 0)),
    }


def get(db: sqlite3.Connection, job_id: str) -> dict | None:
    ensure_table(db)
    row = db.execute(
        'SELECT id, status, spec, run_id, error, created_at, updated_at FROM jobs WHERE id=?',
        (job_id,),
    ).fetchone()
    if not row:
        return None
    return {
        'id': row[0],
        'status': row[1],
        'spec': json.loads(row[2]),
        'run_id': row[3],
        'error': row[4],
        'created_at': row[5],
        'updated_at': row[6],
    }
