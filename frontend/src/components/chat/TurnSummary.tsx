import type { AgentResponse, SearchResponse } from "../../types";

interface Props {
  query: string;
  result: AgentResponse | null;
  goal?: string;
  search?: SearchResponse | null;
}

const CONSTRAINT_LABEL: Record<string, string> = {
  energy_mismatch: "Energy constraint blocked",
  experiment_mismatch: "Experiment constraint blocked",
  energy_match: "Energy matches runnable adapter",
  catalog: "Catalog only",
};

const TOOL_LABEL: Record<string, string> = {
  search: "Catalog search",
  ask: "Grounded answer",
  fetch_record: "Record files",
};

export default function TurnSummary({ query, result, goal, search }: Props) {
  const tools = result?.tools_used ?? [];
  const displayGoal = goal || result?.goal;
  const searchMeta = search ?? result?.search ?? null;
  const constraintMatch = searchMeta?.constraint_match;
  const binding = searchMeta?.investigation_binding;

  return (
    <div className="turn-summary">
      <p className="turn-query">
        <span className="microlabel">You asked</span>
        <q>{query}</q>
      </p>
      {(constraintMatch || binding) && (
        <div className="turn-constraint-row" role="status">
          {constraintMatch && (
            <span className={`turn-constraint-chip turn-constraint-${constraintMatch}`}>
              {CONSTRAINT_LABEL[constraintMatch] ?? constraintMatch.replace(/_/g, " ")}
            </span>
          )}
          {binding && (
            <span className={`turn-binding-chip ${binding.available ? "ok" : "locked"}`}>
              Home investigation · record {binding.record_id} · {binding.energy_tev} TeV
              {!binding.available ? " (analysis not switched)" : ""}
            </span>
          )}
        </div>
      )}
      {(displayGoal || tools.length > 0) && (
        <div className="turn-meta">
          {displayGoal && displayGoal !== query && (
            <p className="turn-goal">
              <span className="microlabel">Plan</span> {displayGoal}
            </p>
          )}
          {tools.length > 0 && (
            <div className="turn-tools">
              {tools.map((t) => (
                <span key={t} className="turn-tool-chip">
                  {TOOL_LABEL[t] ?? t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
