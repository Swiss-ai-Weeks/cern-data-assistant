"""Tests for the in-process TTL cache."""

import unittest

from cache import TTLCache


class TTLCacheTests(unittest.TestCase):
    def test_miss_then_hit(self):
        c = TTLCache(ttl=60)
        self.assertIsNone(c.get("k"))
        c.set("k", {"n": 1})
        self.assertEqual(c.get("k"), {"n": 1})
        stats = c.stats()
        self.assertEqual(stats["hits"], 1)
        self.assertEqual(stats["misses"], 1)
        self.assertEqual(stats["size"], 1)

    def test_evicts_when_full(self):
        c = TTLCache(ttl=60, maxsize=2)
        c.set("a", 1)
        c.set("b", 2)
        c.set("c", 3)
        self.assertEqual(c.stats()["size"], 2)
        self.assertIsNone(c.get("a"))
        self.assertEqual(c.get("b"), 2)
        self.assertEqual(c.get("c"), 3)
