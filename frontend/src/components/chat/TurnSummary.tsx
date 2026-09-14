import type { AgentResponse } from "../../types";

interface Props {
  query: string;
  result: AgentResponse | null;
  goal?: string;
}

const TOOL_LABEL: Record<string, string> = {
  search: "Catalog search",
  ask: "Grounded answer",
  fetch_record: "Record files",
};

export default function TurnSummary({ query, result, goal }: Props) {
  const tools = result?.tools_used ?? [];
  const displayGoal = goal || result?.goal;

  return (
    <div className="turn-summary">
      <p className="turn-query">
        <span className="microlabel">You asked</span>
        <q>{query}</q>
      </p>
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
