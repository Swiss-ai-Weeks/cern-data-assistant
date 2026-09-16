import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from analysis import provenance, recipe


def test_run_lineage_matches_deterministic_id():
    manifest = {'sha256': 'abc', 'sample_file': 'sample-x.npz', 'record_url': 'https://example', 'doi': 'x'}
    run = {
        'id': recipe.deterministic_run_id(manifest, recipe.DEFAULT_SPEC),
        'spec': recipe.DEFAULT_SPEC,
        'manifest': manifest,
        'recipe_sha256': 'deadbeef',
        'recipe': recipe.VERSION,
    }
    lineage = provenance.run_lineage(run)
    assert lineage['deterministic_id'] == run['id']
    assert lineage['sample_sha256'] == 'abc'
