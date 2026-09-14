"""Tests for search-query broadening (no CERN network)."""

import unittest

from cern_client import broadening_attempts


class BroadeningTests(unittest.TestCase):
    def test_drops_trailing_keywords(self):
        self.assertEqual(
            broadening_attempts("CMS muon proton collisions 13 TeV"),
            [
                "CMS muon proton collisions 13 TeV",
                "CMS muon proton collisions 13",
                "CMS muon proton collisions",
                "CMS muon proton",
                "CMS muon",
                "CMS",
            ],
        )

    def test_single_word_stays(self):
        self.assertEqual(broadening_attempts("CMS"), ["CMS"])

    def test_empty_falls_back(self):
        self.assertEqual(broadening_attempts(""), [""])
