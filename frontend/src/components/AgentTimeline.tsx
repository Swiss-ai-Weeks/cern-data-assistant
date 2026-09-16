import { buildTimeline, type TimelineStage } from "../lib/agentTimeline";
import type { AgentStreamEvent } from "../api";

const STAGE_SHORT: Record<string, string> = {
  interpret_intent: "Interpreting intent",
  search_catalog: "Querying CERN Open Data",
  rank_records: "Ranking records",
  retrieve_docs: "Retrieving evidence",
  verify_grounding: "Verifying citations",
  prepare_handoff: "Preparing handoff",
};

interface Props {
  events: AgentStreamEvent[];
  live: boolean;
  error: string | null;
  answerGrounded: boolean | null;
}

function activeStage(stages: TimelineStage[]): TimelineStage | null {
  return (
    stages.find((s) => s.state === "active" || s.state === "blocked") ??
    stages.find((s) => s.state === "warning") ??
    null
  );
}

export default function AgentTimeline({ events, live, error, answerGrounded }: Props) {
  const stages = buildTimeline(events, live, error, answerGrounded);
  if (events.length === 0 && !error) return null;

  const current = activeStage(stages);
  if (!live) {
    if (!error && answerGrounded !== false) return null;
    return (
      <div className="beamline-progress beamline-progress-done" role="status">
        <p className="beamline-progress-label">
          {error ? "Investigation stopped" : "Answer not fully grounded"}
        </p>
        {current?.detail && <p className="beamline-progress-detail">{current.detail}</p>}
      </div>
    );
  }

  const label = current ? (STAGE_SHORT[current.id] ?? current.label) : "Working…";
  const detail = current?.detail;
  const elapsed = current?.elapsedMs;

  return (
    <div className="beamline-progress" aria-live="polite" aria-busy="true" aria-label="Investigation in progress">
      <span className="beamline-progress-spinner" aria-hidden />
      <div className="beamline-progress-main">
        <div className="beamline-progress-row">
          <span className="beamline-progress-label">{label}</span>
          {elapsed != null && (
            <span className="beamline-progress-time">{(elapsed / 1000).toFixed(1)}s</span>
          )}
        </div>
        {detail && <p className="beamline-progress-detail">{detail}</p>}
      </div>
    </div>
  );
}
