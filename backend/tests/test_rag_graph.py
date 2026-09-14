"""Glossary graph in rag.py + the term-suggestion call, no Ollama needed."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

import ollama_client
import rag


def _chunk(term, text, kind="glossary"):
    return {"recid": f"glossary:{term}", "kind": kind, "title": f"Glossary: {term}",
            "section": "", "experiment": "", "term": term, "text": text,
            "source": "https://opendata.cern.ch/glossary#x"}


FIXTURE = [
    _chunk("Proton / proton / protons", "Glossary term: Proton\n\nA hadron.\nSee also: Hadron, Electron"),
    _chunk("Hadron / hadrons", "Glossary term: Hadron\n\nMade of quarks."),
    _chunk("Electron", "Glossary term: Electron\n\nA lepton."),
    _chunk("Ion", "Glossary term: Ion\n\nAn atom missing electrons."),
    _chunk("Quark", "Glossary term: Quark\n\nElementary."),
    {"recid": "doc:1", "kind": "doc", "title": "About CMS", "section": "Magnet",
     "experiment": "CMS", "term": None, "text": "solenoid", "source": "https://x"},
]
# unit vectors: proton~ion (cos 0.9), everything else orthogonal
VECS = np.array([
    [1.0, 0.0, 0.0, 0.0],
    [0.0, 1.0, 0.0, 0.0],
    [0.0, 0.0, 1.0, 0.0],
    [0.9, 0.43589, 0.0, 0.0],
    [0.0, 0.0, 0.0, 1.0],
    [0.5, 0.5, 0.5, 0.5],
], dtype=np.float32)


def _fixture_kb():
    tmp = tempfile.mkdtemp()
    np.save(Path(tmp) / "index.npy", VECS)
    (Path(tmp) / "chunks.json").write_text(json.dumps(FIXTURE))
    with mock.patch.object(rag, "VECTORS_PATH", Path(tmp) / "index.npy"), \
         mock.patch.object(rag, "CHUNKS_PATH", Path(tmp) / "chunks.json"):
        return rag.KnowledgeBase()


class GraphBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = _fixture_kb()

    def test_every_spelling_variant_is_a_key(self):
        for v in ("proton", "protons", "hadron", "hadrons", "ion"):
            self.assertIn(v, self.kb.term_to_idx)
        self.assertEqual(self.kb.term_to_idx["protons"], self.kb.term_to_idx["proton"])

    def test_see_also_edges_are_symmetric(self):
        p, h, e = (self.kb.term_to_idx[t] for t in ("proton", "hadron", "electron"))
        self.assertIn(h, self.kb.neighbors[p])
        self.assertIn(e, self.kb.neighbors[p])
        self.assertIn(p, self.kb.neighbors[h])
        self.assertIn(p, self.kb.neighbors[e])

    def test_embedding_neighbour_edge(self):
        p, i = self.kb.term_to_idx["proton"], self.kb.term_to_idx["ion"]
        self.assertIn(i, self.kb.neighbors[p])
        self.assertIn(p, self.kb.neighbors[i])

    def test_far_term_has_no_edges_and_docs_are_not_nodes(self):
        self.assertEqual(self.kb.neighbors[self.kb.term_to_idx["quark"]], [])
        self.assertNotIn(5, self.kb.neighbors)

    def test_boost_fires_on_a_plural_variant(self):
        hits = self.kb.search([1.0, 0.0, 0.0, 0.0], k=2, query_text="how many protons are there")
        top = hits[0]
        self.assertEqual(top["term"], "Proton / proton / protons")
        self.assertAlmostEqual(top["score"] - top["score_raw"], rag.GLOSSARY_BOOST, places=5)


class ExpandTermsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = _fixture_kb()

    def test_anchor_then_one_hop(self):
        self.assertEqual(self.kb.expand_terms(["proton"]), ["Proton", "Hadron", "Electron", "Ion"])

    def test_plural_and_case_resolve(self):
        self.assertEqual(self.kb.expand_terms(["Protons"])[0], "Proton")
        self.assertEqual(self.kb.expand_terms(["hadrons"])[0], "Hadron")

    def test_unknown_vocabulary_is_dropped(self):
        self.assertEqual(self.kb.expand_terms(["hawking radiation", "event horizon"]), [])
        self.assertEqual(self.kb.expand_terms(["atom", "quark"]), ["Quark"])

    def test_limit_and_dedupe(self):
        self.assertEqual(self.kb.expand_terms(["proton", "proton", "ion"], limit=2), ["Proton", "Ion"])

    def test_empty_input(self):
        self.assertEqual(self.kb.expand_terms([]), [])
        self.assertEqual(self.kb.expand_terms(["", None]), [])


class SuggestTermsTests(unittest.TestCase):
    def test_parses_and_normalises(self):
        payload = {"terms": ["Atom", "nucleus", " ATOM ", "proton", 7, "z" * 80]}
        with mock.patch.object(ollama_client, "_chat_json", return_value=payload) as cj:
            out = ollama_client.suggest_glossary_terms("What is an atom made of?")
        self.assertEqual(out[:3], ["atom", "nucleus", "proton"])
        self.assertEqual(len(out[3]), 40)
        self.assertEqual(cj.call_args.kwargs["temperature"], 0.0)
        self.assertEqual(cj.call_args.kwargs["model"], ollama_client.OLLAMA_FALLBACK_MODEL)

    def test_caps_at_six(self):
        payload = {"terms": [f"t{i}" for i in range(10)]}
        with mock.patch.object(ollama_client, "_chat_json", return_value=payload):
            self.assertEqual(len(ollama_client.suggest_glossary_terms("q")), 6)

    def test_garbage_and_outage_give_empty(self):
        with mock.patch.object(ollama_client, "_chat_json", return_value={}):
            self.assertEqual(ollama_client.suggest_glossary_terms("q"), [])
        with mock.patch.object(ollama_client, "_chat_json", return_value={"terms": "nope"}):
            self.assertEqual(ollama_client.suggest_glossary_terms("q"), [])
        with mock.patch.object(ollama_client, "_chat_json",
                               side_effect=ollama_client.OllamaUnavailable("down")):
            self.assertEqual(ollama_client.suggest_glossary_terms("q"), [])


if __name__ == "__main__":
    unittest.main()
