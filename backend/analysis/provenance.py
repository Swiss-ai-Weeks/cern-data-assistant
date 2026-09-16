"""Run lineage — immutable identity of a computed investigation artifact."""
from __future__ import annotations

from pathlib import Path

from . import recipe


def run_lineage(run: dict, *, recipe_path: Path | None = None) -> dict:
    manifest = run.get('manifest') or {}
    spec = run.get('spec') or recipe.DEFAULT_SPEC
    recipe_path = recipe_path or Path(recipe.__file__)
    return {
        'run_id': run.get('id'),
        'deterministic_id': recipe.deterministic_run_id(manifest, spec, recipe_path=recipe_path),
        'recipe_version': run.get('recipe') or recipe.VERSION,
        'recipe_sha256': run.get('recipe_sha256'),
        'sample_sha256': manifest.get('sha256'),
        'sample_file': manifest.get('sample_file'),
        'record_url': manifest.get('record_url'),
        'doi': manifest.get('doi'),
        'scope': manifest.get('scope'),
        'sampling': manifest.get('sampling'),
        'spec': spec,
        'created_at': run.get('created_at'),
        'cached': bool(run.get('cached')),
        'compute_ms': run.get('compute_ms'),
    }


def export_bundle_metadata(run: dict, *, baseline_id: str | None = None) -> dict:
    meta = {
        'schema': 'beamline-run-provenance/v1',
        'lineage': run_lineage(run),
    }
    if baseline_id:
        meta['baseline_run_id'] = baseline_id
    return meta
