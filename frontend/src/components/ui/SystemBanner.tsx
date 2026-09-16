import type { HealthResponse } from "../../types";

interface Props {
  health: HealthResponse | null | undefined;
}

export default function SystemBanner({ health }: Props) {
  if (health === undefined) return null;
  if (health === null) {
    return (
      <div className="system-banner system-banner-error" role="alert">
        Cannot reach the Beamline service. Check your network or try again in a moment.
      </div>
    );
  }

  const cernDown = health.cern_api !== "ok";
  const modelDown = health.ollama !== "ok";
  const kbEmpty = health.knowledge_base === "empty" || (health.knowledge_chunks ?? 0) === 0;

  if (!cernDown && !modelDown && !kbEmpty) return null;

  const parts: string[] = [];
  if (cernDown) parts.push("CERN catalog unreachable — dataset search may fail.");
  if (modelDown) parts.push("Language model offline — ranking and grounded answers are disabled.");
  if (kbEmpty) parts.push("Documentation index is empty — ask your operator to build the knowledge base.");

  return (
    <div className="system-banner system-banner-warn" role="status">
      {parts.join(" ")}
    </div>
  );
}
