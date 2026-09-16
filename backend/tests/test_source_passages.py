import json
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import source_passages


def test_fetch_record_writes_cache(tmp_path):
    payload = {
        'metadata': {
            'title': 'Test record',
            'abstract': {'description': 'Trigger-related feature around 30 GeV.'},
        }
    }
    with mock.patch('analysis.source_passages.requests.get') as get:
        get.return_value.json.return_value = payload
        get.return_value.raise_for_status = lambda: None
        item = source_passages.load_or_fetch(tmp_path, '12342')
    assert item['curated_summary'] is False
    assert '30 GeV' in item['text']
    cached = json.loads((tmp_path / 'source_passages' / 'record-12342.json').read_text())
    assert cached['sha256'] == item['sha256']
