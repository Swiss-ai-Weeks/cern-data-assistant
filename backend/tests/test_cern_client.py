"""Tests for CERN record flattening helpers (no network)."""

import unittest

import cern_client as c


class FormatSizeTests(unittest.TestCase):
    def test_unknown_and_zero(self):
        self.assertEqual(c.format_size(None), "—")
        self.assertEqual(c.format_size(0), "—")

    def test_units(self):
        self.assertEqual(c.format_size(512), "512 B")
        self.assertEqual(c.format_size(2048), "2.00 KB")
        self.assertEqual(c.format_size(1024 ** 3), "1.00 GB")


class KindAndUsageTests(unittest.TestCase):
    def test_dataset_kind(self):
        self.assertEqual(c._kind({"type": {"primary": "Dataset"}}), "Dataset")
        self.assertEqual(c._kind({"type": {"primary": "Documentation"}}), "Documentation")
        self.assertEqual(c._kind({"type": "software"}), "Software")

    def test_usage_command(self):
        self.assertIn("download-files --recid 123", c._usage_command(123, "Dataset"))
        self.assertIn("opendata.cern.ch/record/123", c._usage_command(123, "Documentation"))


class SummarizeHitTests(unittest.TestCase):
    def test_flattens_a_dataset_hit(self):
        hit = {
            "id": 42,
            "metadata": {
                "title": "CMS muon dataset",
                "experiment": ["CMS"],
                "type": {"primary": "Dataset"},
                "abstract": {"description": "Proton collisions with muons."},
                "date_published": "2016-01-01",
                "distribution": {"size": 2048, "formats": ["root", "json"], "number_files": 2},
                "doi": "10.7483/OPENDATA.CMS.TEST",
            },
        }
        s = c.summarize_hit(hit)
        self.assertEqual(s["recid"], 42)
        self.assertEqual(s["kind"], "Dataset")
        self.assertTrue(s["is_dataset"])
        self.assertEqual(s["experiment"], "CMS")
        self.assertEqual(s["size"], "2.00 KB")
        self.assertEqual(s["formats"], ["root", "json"])
        self.assertIn("cernopendata-client", s["usage"])
        self.assertIn("opendata.cern.ch/record/42", s["url"])
        self.assertIn("10.7483/OPENDATA.CMS.TEST", s["citation"])


class CollisionInformationTests(unittest.TestCase):
    def test_reads_nested_collision_information(self):
        hit = {"id": 30522, "metadata": {"title": "/DoubleMuon/Run2016G/MINIAOD",
               "type": {"primary": "Dataset", "secondary": ["Collision"]},
               "collision_information": {"energy": "13TeV", "type": "pp"},
               "run_period": ["Run2016G"]}}
        out = c.summarize_hit(hit)
        self.assertEqual(out["collision_energy"], "13TeV")
        self.assertEqual(out["collision_type"], "pp")
        self.assertEqual(out["run_period"], "Run2016G")

    def test_falls_back_to_flat_keys(self):
        out = c.summarize_hit({"id": 1, "metadata": {"collision_energy": "7TeV"}})
        self.assertEqual(out["collision_energy"], "7TeV")
        self.assertEqual(out["collision_type"], "—")

