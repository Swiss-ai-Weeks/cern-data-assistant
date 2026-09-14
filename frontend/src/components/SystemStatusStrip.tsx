import type { HealthResponse } from "../types";

interface Props {
  health: HealthResponse | null;
}

export default function SystemStatusStrip({ health }: Props) {
  const cernOk = health?.cern_api === "ok";
  const ollamaOk = health?.ollama === "ok";
  const kb = health?.knowledge_chunks ?? 0;
  const floor = health?.guardrails?.min_top_score;

  return (
    <div className="status-strip" role="status" aria-live="polite">
      <div className="status-strip-inner">
        <Item
          label="CERN catalog"
          value={cernOk ? "live" : health ? "offline" : "…"}
          state={cernOk ? "ok" : health ? "down" : "idle"}
        />
        <Item
          label="Grounding index"
          value={kb ? `${kb} sources` : health?.knowledge_base === "empty" ? "empty" : "…"}
          state={kb > 0 ? "ok" : "idle"}
        />
        <Item
          label="Model"
          value={ollamaOk ? health?.ollama_model ?? "ready" : health ? "unreachable" : "…"}
          state={ollamaOk ? "ok" : health ? "down" : "idle"}
        />
        <Item
          label="Evidence floor"
          value={floor != null ? String(floor) : "…"}
          state="ok"
        />
      </div>
    </div>
  );
}

function Item({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "ok" | "down" | "idle";
}) {
  return (
    <div className={`status-strip-item ${state === "down" ? "down" : state === "ok" ? "ok" : ""}`}>
      <span className="status-strip-label">{label}</span>
      <span className="status-strip-value">{value}</span>
    </div>
  );
}
