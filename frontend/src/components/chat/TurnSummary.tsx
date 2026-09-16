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

export default function TurnSummary({ query, result, goal, search }: Props) {
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
              Runnable lab · record {binding.record_id} · {binding.energy_tev} TeV
              {!binding.available ? " (analysis not switched)" : ""}
            </span>
          )}
        </div>
      )}
      {displayGoal && displayGoal !== query && (
        <div className="turn-meta">
          <p className="turn-goal">{displayGoal}</p>
        </div>
      )}
    </div>
  );
}
