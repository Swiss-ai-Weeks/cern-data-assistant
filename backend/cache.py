"""Tiny in-process TTL cache. Used to keep CERN Open Data HTTP off the hot path
during a demo (repeat searches, health pings, record lookups)."""

from __future__ import annotations

import time
from threading import Lock
from typing import Any


class TTLCache:
    def __init__(self, ttl: float = 300.0, maxsize: int = 256):
        self.ttl = ttl
        self.maxsize = maxsize
        self._data: dict[Any, tuple[float, Any]] = {}
        self._lock = Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key):
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                self.misses += 1
                return None
            expires, value = item
            if expires <= now:
                del self._data[key]
                self.misses += 1
                return None
            self.hits += 1
            return value

    def set(self, key, value):
        expires = time.monotonic() + self.ttl
        with self._lock:
            if len(self._data) >= self.maxsize and key not in self._data:
                # Drop the soonest-to-expire entry (good enough for a demo).
                oldest = min(self._data, key=lambda k: self._data[k][0])
                del self._data[oldest]
            self._data[key] = (expires, value)

    def stats(self) -> dict:
        with self._lock:
            return {
                "size": len(self._data),
                "hits": self.hits,
                "misses": self.misses,
            }
