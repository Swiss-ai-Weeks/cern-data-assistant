import type { AskResponse } from "../types";

interface Props {
  result: AskResponse;
  generatedAt: string | null;
  compact?: boolean;
}

function answerStatus(result: AskResponse): string {
  if (result.grounded && result.guardrail === "grounded:low_confidence") return "Limited evidence";
  if (result.grounded) return "Grounded";
  return "Not released";
}

export default function GroundingReceipt({ result, generatedAt, compact }: Props) {
  const d = result.guardrail_detail;
  const cited = result.sources.filter((s) => s.used);
  const validation =
    result.guardrail === "grounded" || result.guardrail === "grounded:low_confidence"
      ? "Citations checked"
      : result.guardrail?.startsWith("retrieval")
        ? "No source above floor"
        : result.guardrail?.startsWith("citation")
          ? "Citations rejected"
          : "Held back";

  const tiles = [
    { label: "Status", value: answerStatus(result) },
    {
      label: "Sources",
      value: `${cited.length} cited`,
      hint: `${result.sources.length} retrieved`,
    },
    d
      ? {
          label: "Retrieval",
          value: d.top_score.toFixed(2),
          hint: `floor ${d.threshold.toFixed(2)}`,
        }
      : null,
    { label: "Check", value: validation },
    result.model_used ? { label: "Model", value: result.model_used } : null,
    generatedAt
      ? {
          label: "Generated",
          value: new Date(generatedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        }
      : null,
  ].filter(Boolean) as { label: string; value: string; hint?: string }[];

  return (
    <div className={`receipt grounding-receipt ${compact ? "compact" : ""}`}>
      <p className="microlabel">Grounding receipt</p>
      <ul className="receipt-tiles">
        {tiles.map((t) => (
          <li key={t.label}>
            <span className="receipt-tile-label">{t.label}</span>
            <strong>{t.value}</strong>
            {t.hint && <span className="receipt-tile-hint">{t.hint}</span>}
          </li>
        ))}
      </ul>
      {d?.citations_removed != null && d.citations_removed > 0 && (
        <p className="receipt-note">{d.citations_removed} invalid citation{d.citations_removed === 1 ? "" : "s"} stripped</p>
      )}
    </div>
  );
}
