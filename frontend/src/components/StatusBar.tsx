import type { HealthResponse } from "../types";

interface Props {
  health: HealthResponse | null;
}

export default function StatusBar({ health }: Props) {
  const cernOk = health?.cern_api === "ok";
  const ollamaOk = health?.ollama === "ok";
  const kbOk = health?.knowledge_base === "ready";

  return (
    <nav className="status-pills" aria-label="System">
      <span className={`pill ${cernOk ? "on" : health ? "down" : ""}`}>CERN</span>
      <span className={`pill ${ollamaOk ? "on" : health ? "down" : ""}`}>
        {ollamaOk ? health?.ollama_model : "GPU"}
      </span>
      <span className={`pill ${kbOk ? "on" : ""}`}>
        {kbOk ? `${health?.knowledge_chunks} sources` : "index"}
      </span>
    </nav>
  );
}
