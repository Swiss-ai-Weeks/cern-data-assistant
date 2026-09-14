"""
store.py — SQLite persistence for the CERN Data Assistant.

A real product remembers conversations, records what the agent did, and
collects feedback. This is a tiny, dependency-free wrapper over the stdlib
`sqlite3` module (WAL mode, one connection guarded by a lock — plenty for the
demo's concurrency) exposing:

  sessions(id, created_at, title)
  messages(id, session_id, role, content, meta_json, created_at)
  events(id, session_id, message_id, kind, data_json, created_at)   # agent trace
  feedback(id, session_id, message_id, rating, note, created_at)

Everything is best-effort: if the DB can't be opened we degrade to a no-op so
the assistant still answers (persistence is not on the critical path).
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from threading import Lock
from typing import Any, Optional

DB_PATH = os.environ.get(
    "BEAMLINE_DB",
    str(Path(__file__).resolve().parent / "data" / "beamline.db"),
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    created_at  REAL NOT NULL,
    title       TEXT
);
CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    meta_json   TEXT,
    created_at  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT,
    message_id  TEXT,
    kind        TEXT NOT NULL,
    data_json   TEXT,
    created_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT,
    message_id  TEXT NOT NULL,
    rating      INTEGER NOT NULL,
    note        TEXT,
    created_at  REAL NOT NULL
);
"""


class Store:
    def __init__(self, path: str = DB_PATH) -> None:
        self._lock = Lock()
        self._ok = False
        self._conn: Optional[sqlite3.Connection] = None
        try:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            self._conn = sqlite3.connect(path, check_same_thread=False)
            self._conn.row_factory = sqlite3.Row
            self._conn.executescript("PRAGMA journal_mode=WAL;\n" + _SCHEMA)
            self._conn.commit()
            self._ok = True
        except Exception:  # noqa: BLE001 — persistence is optional
            self._ok = False

    @property
    def ready(self) -> bool:
        return self._ok

    # -- writes --------------------------------------------------------------

    def ensure_session(self, session_id: Optional[str], title: str = "") -> str:
        sid = session_id or f"s_{uuid.uuid4().hex[:12]}"
        if not self._ok:
            return sid
        with self._lock:
            row = self._conn.execute("SELECT id FROM sessions WHERE id=?", (sid,)).fetchone()
            if row is None:
                self._conn.execute(
                    "INSERT INTO sessions (id, created_at, title) VALUES (?,?,?)",
                    (sid, time.time(), title[:120]),
                )
                self._conn.commit()
        return sid

    def add_message(self, session_id: str, role: str, content: str,
                    meta: Optional[dict] = None) -> str:
        mid = f"m_{uuid.uuid4().hex[:12]}"
        if not self._ok:
            return mid
        with self._lock:
            self._conn.execute(
                "INSERT INTO messages (id, session_id, role, content, meta_json, created_at) "
                "VALUES (?,?,?,?,?,?)",
                (mid, session_id, role, content,
                 json.dumps(meta, ensure_ascii=False) if meta else None, time.time()),
            )
            self._conn.commit()
        return mid

    def add_event(self, session_id: str, message_id: Optional[str],
                  kind: str, data: Any) -> None:
        if not self._ok:
            return
        with self._lock:
            self._conn.execute(
                "INSERT INTO events (session_id, message_id, kind, data_json, created_at) "
                "VALUES (?,?,?,?,?)",
                (session_id, message_id, kind,
                 json.dumps(data, ensure_ascii=False, default=str), time.time()),
            )
            self._conn.commit()

    def add_feedback(self, session_id: Optional[str], message_id: str,
                     rating: int, note: str = "") -> None:
        if not self._ok:
            return
        with self._lock:
            self._conn.execute(
                "INSERT INTO feedback (session_id, message_id, rating, note, created_at) "
                "VALUES (?,?,?,?,?)",
                (session_id, message_id, 1 if rating > 0 else -1, note[:500], time.time()),
            )
            self._conn.commit()

    # -- reads ---------------------------------------------------------------

    def history(self, session_id: str, limit: int = 12) -> list[dict]:
        """Recent turns for a session, oldest first."""
        if not self._ok:
            return []
        with self._lock:
            rows = self._conn.execute(
                "SELECT role, content, meta_json, created_at FROM messages "
                "WHERE session_id=? ORDER BY created_at DESC LIMIT ?",
                (session_id, limit),
            ).fetchall()
        out = [
            {"role": r["role"], "content": r["content"],
             "meta": json.loads(r["meta_json"]) if r["meta_json"] else {},
             "created_at": r["created_at"]}
            for r in rows
        ]
        out.reverse()
        return out

    def metrics(self) -> dict:
        if not self._ok:
            return {"ready": False}
        with self._lock:
            def scalar(sql: str) -> int:
                return int(self._conn.execute(sql).fetchone()[0] or 0)
            sessions = scalar("SELECT COUNT(*) FROM sessions")
            messages = scalar("SELECT COUNT(*) FROM messages")
            user_msgs = scalar("SELECT COUNT(*) FROM messages WHERE role='user'")
            up = scalar("SELECT COUNT(*) FROM feedback WHERE rating>0")
            down = scalar("SELECT COUNT(*) FROM feedback WHERE rating<0")
        return {
            "ready": True,
            "sessions": sessions,
            "messages": messages,
            "user_messages": user_msgs,
            "feedback_up": up,
            "feedback_down": down,
        }


_STORE: Optional[Store] = None


def get_store() -> Store:
    global _STORE
    if _STORE is None:
        _STORE = Store()
    return _STORE
