"""Grounding must reject invalid verdicts, outages, and lexical contradictions."""
from unittest import mock
import pytest
import app as api
import ollama_client

@pytest.mark.parametrize('verdict', [{}, [], {'supported': 'false', 'unsupported': []}, {'supported': True}, {'supported': True, 'unsupported': [42]}])
def test_malformed_verdict_is_unavailable(verdict):
    with mock.patch.object(ollama_client, '_chat_json', return_value=verdict):
        with pytest.raises(ollama_client.OllamaUnavailable):
            ollama_client.verify_grounding('Claim [1].', [])

@pytest.mark.parametrize('verdict', [
    {'supported': False, 'unsupported': []},
    {'supported': False, 'unsupported': ['CMS does not use a solenoid']},
    {'supported': True, 'unsupported': ['CMS does not use a solenoid']},
    ollama_client.OllamaUnavailable('down'),
])
def test_rejected_or_unverified_answer_never_grounded(verdict):
    kb = mock.Mock(ready=True)
    kb.search.return_value = [{'score_raw': 0.9, 'score': 0.9, 'title': 'CMS', 'text': 'CMS uses a solenoid', 'source': 'https://opendata.cern.ch'}]
    kwargs = {'side_effect': verdict} if isinstance(verdict, Exception) else {'return_value': verdict}
    with mock.patch.object(api.rag, 'get_kb', return_value=kb), mock.patch.object(ollama_client, 'embed', return_value=[1]), mock.patch.object(ollama_client, 'answer_with_context', return_value='CMS does not use a solenoid [1].'), mock.patch.object(ollama_client, 'verify_grounding', **kwargs), mock.patch.object(ollama_client, 'ungrounded_draft', return_value=''):
        response = api.app.test_client().post('/api/ask', json={'query': 'Why does CMS use a solenoid?'})
    assert response.status_code == 200
    assert response.json['grounded'] is False
    assert response.json['guardrail'].startswith('grounding:')
