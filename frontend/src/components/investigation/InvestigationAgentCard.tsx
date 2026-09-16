import type { AgentInvestigationResult } from "../../types";
import MiniSpectrum from "./MiniSpectrum";

export default function InvestigationAgentCard({
  data,
  onOpenWorkspace,
}: {
  data: AgentInvestigationResult;
  onOpenWorkspace: () => void;
}) {
  if (!data.ready) {
    return (
      <article className="iv-agent-card iv-agent-card-down">
        <p className="iv-eyebrow">CMS lab</p>
        <p>{data.message ?? "The dimuon sample is not staged on this server."}</p>
      </article>
    );
  }
  const run = data.run!;
  const topClaims = (data.claims ?? []).slice(0, 3);
  return (
    <article className="iv-agent-card">
      <header>
        <p className="iv-eyebrow">Calculated from staged CMS data</p>
        <h3>Dimuon spectrum</h3>
        <p className="iv-caption">{data.interpretation?.message}</p>
      </header>
      <MiniSpectrum histogram={run.histogram} />
      {data.reference_validation && (
        <p className="iv-caption">
          28–33 GeV: {data.reference_validation.region_28_33_gev_events?.toLocaleString?.() ?? "—"} events
          {data.reference_validation.reference_feature_visible ? " · above local baseline on this sample" : ""}
        </p>
      )}
      <dl className="iv-agent-stats">
        <div><dt>Selected</dt><dd>{run.selected_events.toLocaleString()}</dd></div>
        <div><dt>Plotted</dt><dd>{run.plotted_events.toLocaleString()}</dd></div>
        <div><dt>pT cut</dt><dd>≥ {run.spec.min_pt} GeV</dd></div>
        <div><dt>Compute</dt><dd>{data.cached ? "Cached" : `${data.compute_ms ?? run.compute_ms ?? "—"} ms`}</dd></div>
      </dl>
      {topClaims.length > 0 && (
        <ul className="iv-agent-claims">
          {topClaims.map((c) => (
            <li key={c.id}><strong>{c.label}</strong> {c.statement}</li>
          ))}
        </ul>
      )}
      <button type="button" className="iv-agent-open" onClick={onOpenWorkspace}>
        Open the lab
      </button>
    </article>
  );
}
