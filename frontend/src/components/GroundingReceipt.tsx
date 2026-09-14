import type { AskResponse } from "../types";

interface Props {
  result: AskResponse;
  generatedAt: string | null;
  compact?: boolean;
}

function answerStatus(result: AskResponse): string {
  if (result.grounded && result.guardrail === "grounded:low_confidence") return "limited evidence";
  if (result.grounded) return "grounded";
  return "refused";
}

export default function GroundingReceipt({ result, generatedAt, compact }: Props) {
  const d = result.guardrail_detail;
  const cited = result.sources.filter((s) => s.used);
  const validation =
    result.guardrail === "grounded" || result.guardrail === "grounded:low_confidence"
      ? "citations validated"
      : result.guardrail ?? "—";

  return (
    <div className={`receipt grounding-receipt ${compact ? "compact" : ""}`}>
      <p className="microlabel">Grounding receipt</p>
      <ul>
        <li>status: {answerStatus(result)}</li>
        <li>
          authoritative sources: {cited.length} cited / {result.sources.length} retrieved
        </li>
        {d && (
          <li>
            best retrieval {d.top_score} vs floor {d.threshold}
          </li>
        )}
        <li>citation validation: {validation}</li>
        {result.model_used && <li>model: {result.model_used}</li>}
        {generatedAt && (
          <li>
            generated:{" "}
            {new Date(generatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </li>
        )}
        {d?.citations_removed != null && d.citations_removed > 0 && (
          <li>citations stripped: {d.citations_removed}</li>
        )}
      </ul>
    </div>
  );
}
