"""Facet extraction + CERN query construction (no network: _get_json mocked)."""

import unittest
from unittest import mock
from urllib.parse import parse_qs, urlparse

import cern_client
from cern_client import extract_facets, facet_ladder, strip_facet_terms


class ExtractFacetsTests(unittest.TestCase):
    def test_demo_query(self):
        self.assertEqual(
            extract_facets("proton-proton collisions at 13 TeV with muons"),
            {"collision_type": "pp", "collision_energy": "13TeV", "type": "Dataset"})

    def test_experiment_and_energy_spellings(self):
        self.assertEqual(extract_facets("CMS 2.76 TeV lead-lead data")["collision_energy"], "2.76TeV")
        self.assertEqual(extract_facets("CMS 2.76 TeV lead-lead data")["collision_type"], "PbPb")
        self.assertEqual(extract_facets("atlas samples at 13TeV")["experiment"], "ATLAS")
        self.assertEqual(extract_facets("lhcb data")["experiment"], "LHCb")

    def test_no_facets_for_a_physics_question(self):
        self.assertEqual(extract_facets("Why does CMS use a solenoid?"), {"experiment": "CMS", "type": "Dataset"})
        self.assertEqual(extract_facets("What is pile-up?"), {})

    def test_dataset_words_alone_add_type(self):
        self.assertEqual(extract_facets("Higgs to four leptons samples"), {"type": "Dataset"})


class StripFacetTermsTests(unittest.TestCase):
    def test_leaves_physics_keywords(self):
        facets = extract_facets("proton-proton collisions at 13 TeV with muons")
        self.assertEqual(strip_facet_terms("proton-proton collisions 13 TeV muons", facets), "muons")
        self.assertEqual(strip_facet_terms("proton-proton 13TeV muon", facets), "muon")

    def test_all_facets_means_filters_only(self):
        facets = extract_facets("CMS 13 TeV")
        self.assertEqual(strip_facet_terms("CMS 13 TeV", facets), "")
        facets = extract_facets("lead-lead collisions at 2.76 TeV")
        self.assertEqual(strip_facet_terms("lead-lead collisions 2.76 TeV", facets), "")


class FacetLadderTests(unittest.TestCase):
    def test_loosens_in_order(self):
        f = {"collision_type": "pp", "collision_energy": "13TeV", "experiment": "CMS", "type": "Dataset"}
        self.assertEqual(facet_ladder(f), [
            f,
            {"collision_energy": "13TeV", "experiment": "CMS", "type": "Dataset"},
            {"experiment": "CMS", "type": "Dataset"},
            {"type": "Dataset"},
            {},
        ])

    def test_empty(self):
        self.assertEqual(facet_ladder({}), [{}])


class SearchRecordsFacetTests(unittest.TestCase):
    def setUp(self):
        fresh = mock.patch.object(cern_client, "SEARCH_CACHE", cern_client.TTLCache(ttl=300, maxsize=8))
        fresh.start()
        self.addCleanup(fresh.stop)

    def test_facets_become_query_params(self):
        seen = {}
        def fake_get(url):
            seen["url"] = url
            return {"hits": {"hits": [], "total": 0}}
        with mock.patch.object(cern_client, "_get_json", fake_get):
            cern_client.search_records("muon", size=5, facets={
                "collision_energy": "13TeV", "type": "Dataset", "subtype": "Simulated", "bogus": "x"})
        qs = parse_qs(urlparse(seen["url"]).query)
        self.assertEqual(qs["q"], ["muon"])
        self.assertEqual(qs["collision_energy"], ["13TeV"])
        self.assertEqual(qs["type"], ["Dataset"])
        self.assertNotIn("subtype", qs)  # ignored by the portal, never sent
        self.assertNotIn("bogus", qs)

    def test_cache_key_includes_facets(self):
        calls = []
        def fake_get(url):
            calls.append(url)
            return {"hits": {"hits": [], "total": 0}}
        with mock.patch.object(cern_client, "_get_json", fake_get):
            cern_client.search_records("muon", facets={"type": "Dataset"})
            cern_client.search_records("muon", facets={})
            cern_client.search_records("muon", facets={"type": "Dataset"})
        self.assertEqual(len(calls), 2)


class AliasAndPoolOrderTests(unittest.TestCase):
    def test_aliases_for_muons(self):
        self.assertEqual(cern_client.alias_queries("muons"), ["DoubleMuon", "SingleMuon", "MuOnia"])
        self.assertEqual(cern_client.alias_queries("Higgs four leptons"), [])

    def test_collision_first_unless_simulated_requested(self):
        def hit(i, title, secondary):
            return {"id": i, "metadata": {"title": title, "type": {"primary": "Dataset", "secondary": secondary}}}
        pool = [hit(1, "/SUSY_13TeV/MINIAOD", ["Simulated"]),
                hit(2, "/DoubleMuon/Run2016G/MINIAOD", ["Collision"]),
                hit(3, "ATLAS 13 TeV samples collection two leptons (electron or muon)", ["Derived"]),
                hit(4, "/JpsiToMuMu_13TeV/MINIAOD", ["Simulated"])]
        ordered = cern_client.order_pool(pool, "pp collisions with muons", "muons")
        self.assertEqual([h["id"] for h in ordered], [2, 3, 1, 4])  # ties keep CERN order
        ordered = cern_client.order_pool(pool, "simulated muon samples", "muon")
        self.assertEqual([h["id"] for h in ordered][:2], [1, 4])  # both simulated, CERN order


if __name__ == "__main__":
    unittest.main()
