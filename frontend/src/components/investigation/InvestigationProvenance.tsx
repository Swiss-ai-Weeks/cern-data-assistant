import type { Run } from "../../lib/investigationApi";

export default function InvestigationProvenance({ run }: { run: Run }) {
  const sha = run.recipe_sha256?.slice(0, 12);
  const sample = run.manifest?.sha256?.slice(0, 12);
  return (
    <section className="iv-provenance" aria-label="Run provenance">
      <p className="iv-eyebrow">Reproducibility</p>
      <dl className="iv-provenance-grid">
        <div>
          <dt>Run id</dt>
          <dd className="tnum">{run.id}</dd>
        </div>
        <div>
          <dt>Recipe</dt>
          <dd className="tnum">{sha ? `${sha}…` : "—"}</dd>
        </div>
        <div>
          <dt>Sample</dt>
          <dd className="tnum">{sample ? `${sample}…` : "—"}</dd>
        </div>
        <div>
          <dt>Compute</dt>
          <dd>{run.cached ? "Cached replay" : `${run.compute_ms ?? "—"} ms`}</dd>
        </div>
      </dl>
      {run.manifest?.record_url && (
        <a href={run.manifest.record_url} target="_blank" rel="noreferrer" className="iv-provenance-link">
          CERN record {run.manifest.record_id ?? "12341"} ↗
        </a>
      )}
    </section>
  );
}
