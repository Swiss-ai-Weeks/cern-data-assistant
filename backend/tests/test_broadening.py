"""Tests for search-query broadening (no CERN network)."""

import unittest

from cern_client import broadening_attempts, fallback_search_query


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


class FallbackSearchTests(unittest.TestCase):
    def test_strips_energy(self):
        self.assertEqual(
            fallback_search_query("proton-proton collisions 13 TeV muons"),
            "proton-proton collisions muons",
        )

    def test_falls_back_to_experiment(self):
        self.assertEqual(fallback_search_query("CMS"), None)
        self.assertEqual(fallback_search_query("something CMS related"), "CMS")
