"""Ungrounded-draft helper (no Flask / no live Ollama)."""

import unittest
from unittest.mock import patch

import ollama_client


class DraftAllowedTests(unittest.TestCase):
    def test_skips_input_rails(self):
        self.assertFalse(ollama_client.draft_allowed("input:injection"))
        self.assertFalse(ollama_client.draft_allowed("input:unsafe"))
        self.assertTrue(ollama_client.draft_allowed("retrieval:no_source"))
        self.assertTrue(ollama_client.draft_allowed("citation:none"))

    @patch("ollama_client.chat_text", side_effect=ollama_client.OllamaUnavailable("down"))
    def test_empty_when_ollama_down(self, _mock):
        self.assertEqual(ollama_client.ungrounded_draft("How do black holes evaporate?"), "")
