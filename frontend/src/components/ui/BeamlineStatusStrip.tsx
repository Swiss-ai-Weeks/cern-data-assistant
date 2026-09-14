import type { HealthResponse } from "../../types";

interface Props {
  health: HealthResponse | null;
}

function StatusDot({ ok, pending }: { ok: boolean; pending: boolean }) {
  const cls = pending ? "strip-live-dot pending" : ok ? "strip-live-dot ok" : "strip-live-dot down";
  return <span className={cls} aria-hidden />;
}

export default function BeamlineStatusStrip({ health }: Props) {
  const pending = health == null;
  const cernOk = health?.cern_api === "ok";
  const ollamaOk = health?.ollama === "ok";
  const kb = health?.knowledge_chunks ?? 0;

  return (
    <div className="beamline-status-strip" role="status" aria-live="polite">
      <span className={cernOk ? "strip-ok" : health ? "strip-warn" : "strip-muted"}>
        <StatusDot ok={cernOk} pending={pending} />
        Catalog {health ? (cernOk ? "online" : "offline") : "…"}
      </span>
      <span className="strip-dot" aria-hidden>
        ·
      </span>
      <span className={ollamaOk ? "strip-ok" : health ? "strip-warn" : "strip-muted"}>
        <StatusDot ok={ollamaOk} pending={pending} />
        {health ? (ollamaOk ? health.ollama_model : "Model offline") : "Model …"}
      </span>
      {kb > 0 && (
        <>
          <span className="strip-dot" aria-hidden>
            ·
          </span>
          <span className="strip-muted">{kb.toLocaleString()} sources</span>
        </>
      )}
    </div>
  );
}
