import type { HealthResponse } from "../types";

interface Props {
  health: HealthResponse | null;
}

export default function StatusBar({ health }: Props) {
  const cernOk = health?.cern_api === "ok";
  const ollamaOk = health?.ollama === "ok";
  const kbOk = health?.knowledge_base === "ready";

  return (
    <div className="status-pills">
      <span className={`pill ${health ? (cernOk ? "ok" : "down") : ""}`}>
        CERN Open Data
      </span>
      <span className={`pill ${health ? (ollamaOk ? "ok" : "down") : ""}`}>
        {ollamaOk ? health?.ollama_model : "GPU offline"}
      </span>
      <span className={`pill ${kbOk ? "ok" : ""}`}>
        {kbOk ? `${health?.knowledge_chunks} sources` : "no index"}
      </span>
    </div>
  );
}
