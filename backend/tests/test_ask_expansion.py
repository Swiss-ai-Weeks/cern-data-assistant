"""/api/ask: the glossary-graph expansion only runs on the refusal path."""

import unittest
from unittest import mock

import app as app_module
import guardrails
import ollama_client


def _hit(n, score):
    return {"recid": f"glossary:t{n}", "kind": "glossary", "title": f"Glossary: T{n}",
            "section": "", "experiment": "", "term": f"T{n}", "text": f"definition {n}",
            "source": "https://opendata.cern.ch/glossary#t", "score": score, "score_raw": score}


class _FakeKB:
    ready = True
    size = 3

    def __init__(self, expansion):
        self.expansion = expansion
        self.queries = []

    def search(self, vec, k=4, query_text=""):
        self.queries.append(query_text)
        weak = guardrails.MIN_TOP_SCORE - 0.03
        strong = guardrails.MIN_TOP_SCORE + 0.02  # inside the low-confidence band
        s = strong if "(" in query_text else weak
        return [_hit(1, s), _hit(2, s - 0.05)]

    def expand_terms(self, anchors, limit=8):
        return list(self.expansion)


class AskExpansionTests(unittest.TestCase):
    def _ask(self, kb, enabled=True):
        client = app_module.app.test_client()
        with mock.patch.object(app_module.rag, "get_kb", return_value=kb), \
             mock.patch.object(app_module, "EXPAND_ENABLED", enabled), \
             mock.patch.object(ollama_client, "embed", return_value=[1.0, 0.0]), \
             mock.patch.object(ollama_client, "suggest_glossary_terms",
                               return_value=["atom", "nucleus"]) as suggest, \
             mock.patch.object(ollama_client, "answer_with_context",
                               return_value="An atom has a nucleus of protons [1]. Electrons orbit it [2]."), \
             mock.patch.object(ollama_client, "verify_grounding",
                               return_value={"supported": True, "unsupported": []}), \
             mock.patch.object(ollama_client, "get_model", return_value="test-model"), \
             mock.patch.object(ollama_client, "ungrounded_draft", return_value=""):
            res = client.post("/api/ask", json={"query": "What is an atom made of?"})
        return res.get_json(), suggest

    def test_refusal_is_rescued_by_expansion(self):
        kb = _FakeKB(["Nucleus", "Proton", "Electron"])
        body, suggest = self._ask(kb)
        self.assertTrue(body["grounded"])
        self.assertEqual(body["guardrail"], "grounded:low_confidence")
        d = body["guardrail_detail"]
        self.assertEqual(d["expanded_terms"], ["Nucleus", "Proton", "Electron"])
        self.assertEqual(d["expansion"], "glossary_graph")
        self.assertEqual(d["status"], "low_confidence")
        self.assertIn("(Nucleus, Proton, Electron)", kb.queries[-1])
        self.assertIn("[1]", body["answer"])
        suggest.assert_called_once()

    def test_no_glossary_match_still_refuses(self):
        kb = _FakeKB([])
        body, _ = self._ask(kb)
        self.assertFalse(body["grounded"])
        self.assertEqual(body["guardrail"], "retrieval:no_source")
        self.assertEqual(body["guardrail_detail"]["expansion_tried"], [])
        self.assertNotIn("expanded_terms", body["guardrail_detail"])
        self.assertEqual(len(kb.queries), 1)  # no second retrieval

    def test_disabled_flag_skips_the_llm_call(self):
        kb = _FakeKB(["Nucleus"])
        body, suggest = self._ask(kb, enabled=False)
        self.assertFalse(body["grounded"])
        suggest.assert_not_called()
        self.assertNotIn("expansion_tried", body["guardrail_detail"])


if __name__ == "__main__":
    unittest.main()
