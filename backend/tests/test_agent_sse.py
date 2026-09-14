"""SSE envelope adds elapsed_ms without changing event types."""
import time
import unittest

import app as beamline_app


class TestAgentSse(unittest.TestCase):
    def test_sse_elapsed_ms_monotonic(self):
        t0 = time.time()
        time.sleep(0.01)
        ev = beamline_app._sse({"type": "status", "step": "planning"}, t0)
        self.assertEqual(ev["type"], "status")
        self.assertIn("elapsed_ms", ev)
        self.assertGreaterEqual(ev["elapsed_ms"], 10)


if __name__ == "__main__":
    unittest.main()
