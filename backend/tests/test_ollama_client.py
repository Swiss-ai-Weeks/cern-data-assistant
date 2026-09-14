"""ollama_client with the HTTP layer mocked (no Ollama needed)."""

import json
import unittest
from unittest import mock

import requests

import ollama_client


class _Resp:
    def __init__(self, payload, ok=True):
        self._payload, self._ok = payload, ok
    def raise_for_status(self):
        if not self._ok:
            raise requests.HTTPError("boom")
    def json(self):
        return self._payload


class GetModelTests(unittest.TestCase):
    def setUp(self):
        ollama_client._model_cache.update(name=None, at=0)

    def test_uses_primary_when_installed(self):
        with mock.patch.object(ollama_client, "list_models", return_value=[ollama_client.OLLAMA_MODEL]):
            self.assertEqual(ollama_client.get_model(), ollama_client.OLLAMA_MODEL)

    def test_falls_back_when_missing(self):
        with mock.patch.object(ollama_client, "list_models", return_value=["something-else:latest"]):
            self.assertEqual(ollama_client.get_model(), ollama_client.OLLAMA_FALLBACK_MODEL)

    def test_keeps_primary_when_ollama_down(self):
        with mock.patch.object(ollama_client, "list_models", side_effect=ollama_client.OllamaUnavailable("down")):
            self.assertEqual(ollama_client.get_model(), ollama_client.OLLAMA_MODEL)


class ChatTests(unittest.TestCase):
    def setUp(self):
        ollama_client._model_cache.update(name="m", at=ollama_client.time.time())

    def test_chat_json_parses_and_sends_json_mode(self):
        captured = {}
        def fake_post(url, json=None, timeout=None):
            captured.update(url=url, payload=json)
            return _Resp({"message": {"content": "{\"search_terms\": \"muon\", \"size\": 5}"}})
        with mock.patch.object(ollama_client.requests, "post", fake_post):
            out = ollama_client.extract_query("find muon data")
        self.assertEqual(out, {"search_terms": "muon", "size": 5})
        self.assertTrue(captured["url"].endswith("/api/chat"))
        self.assertEqual(captured["payload"]["format"], "json")
        self.assertEqual(captured["payload"]["keep_alive"], -1)

    def test_extract_query_falls_back_on_garbage(self):
        with mock.patch.object(ollama_client.requests, "post",
                               return_value=_Resp({"message": {"content": "not json"}})):
            out = ollama_client.extract_query("find muon data")
        self.assertEqual(out, {"search_terms": "find muon data", "size": 8})

    def test_http_error_becomes_unavailable(self):
        with mock.patch.object(ollama_client.requests, "post",
                               side_effect=requests.ConnectionError("refused")):
            with self.assertRaises(ollama_client.OllamaUnavailable):
                ollama_client.chat_text("s", "u")

    def test_verify_grounding_runs_deterministic(self):
        captured = {}
        def fake_post(url, json=None, timeout=None):
            captured.update(payload=json)
            return _Resp({"message": {"content": "{\"supported\": false, \"unsupported\": [\"x\"]}"}})
        with mock.patch.object(ollama_client.requests, "post", fake_post):
            v = ollama_client.verify_grounding("A [1].", [{"n": 1, "title": "t", "text": "p"}])
        self.assertEqual(v, {"supported": False, "unsupported": ["x"]})
        self.assertEqual(captured["payload"]["options"]["temperature"], 0.0)


class EmbedTests(unittest.TestCase):
    def test_embed_adds_query_prefix_and_batches(self):
        captured = []
        def fake_post(url, json=None, timeout=None):
            captured.append(json)
            return _Resp({"embeddings": [[0.0, 1.0]] * len(json["input"])})
        with mock.patch.object(ollama_client.requests, "post", fake_post):
            vec = ollama_client.embed("pile-up")
            vecs = ollama_client.embed_batch(["a", "b", "c"], batch_size=2)
        self.assertEqual(captured[0]["input"], [ollama_client.EMBED_QUERY_PREFIX + "pile-up"])
        self.assertEqual(len(vecs), 3)
        self.assertTrue(captured[1]["input"][0].startswith(ollama_client.EMBED_DOC_PREFIX))
        self.assertEqual([len(c["input"]) for c in captured[1:]], [2, 1])

    def test_malformed_embedding_raises(self):
        with mock.patch.object(ollama_client.requests, "post",
                               return_value=_Resp({"embeddings": [[1.0]]})):
            with self.assertRaises(ollama_client.OllamaUnavailable):
                ollama_client.embed_batch(["a", "b"])


if __name__ == "__main__":
    unittest.main()
