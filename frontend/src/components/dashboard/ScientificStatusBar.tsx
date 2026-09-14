import type { HealthResponse } from "../../types";
import StatCard from "../ui/StatCard";

interface Props {
  health: HealthResponse | null;
}

export default function ScientificStatusBar({ health }: Props) {
  const cernOk = health?.cern_api === "ok";
  const kb = health?.knowledge_chunks ?? 0;
  const floor = health?.guardrails?.min_top_score;
  const model = health?.ollama === "ok" ? health.ollama_model : health ? "Offline" : "…";

  return (
    <section className="status-cards card-enter" aria-label="Live scientific status">
      <StatCard label="CERN Catalog" value={cernOk ? "Online" : health ? "Offline" : "…"} variant="ink" />
      <StatCard label="Grounding Index" value={kb ? `${kb} sources` : health?.knowledge_base === "empty" ? "Empty" : "…"} />
      <StatCard
        label="Evidence Floor"
        value={floor != null ? String(floor) : "…"}
        variant="wash"
      />
      <StatCard label="Model" value={model} />
    </section>
  );
}
