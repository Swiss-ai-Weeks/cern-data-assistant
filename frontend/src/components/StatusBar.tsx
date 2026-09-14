import type { HealthResponse } from "../types";

interface Props {
  health: HealthResponse | null;
}

export default function StatusBar({ health }: Props) {
  const cernOk = health?.cern_api === "ok";
  const ollamaOk = health?.ollama === "ok";

  return (
    <div className="status-bar">
      <div className="status-line" title="CERN Open Data API">
        <span className={`status-dot ${health ? (cernOk ? "ok" : "down") : ""}`} />
        opendata.cern.ch
      </div>
      <div
        className="status-line"
        title={
          ollamaOk
            ? `Model: ${health?.ollama_model}`
            : "Ollama not reachable at localhost:11434"
        }
      >
        <span className={`status-dot ${health ? (ollamaOk ? "ok" : "down") : ""}`} />
        {ollamaOk ? health?.ollama_model : "ollama offline"}
      </div>
    </div>
  );
}
