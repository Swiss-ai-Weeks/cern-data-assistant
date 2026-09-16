import type { HealthResponse } from "../../types";
import type { DashTab } from "../../layouts/DashboardShell";
import LogoMark from "../LogoMark";

interface Props {
  health: HealthResponse | null;
  activeTab: DashTab;
  investigationOpen: boolean;
  historyOpen: boolean;
  helpOpen: boolean;
  onGoHome: () => void;
  onOpenLab: () => void;
  onToggleHistory: () => void;
  onFocusComposer?: () => void;
  onOpenHelp: () => void;
}

function Dot({ ok, pending }: { ok: boolean; pending: boolean }) {
  const state = pending ? "pending" : ok ? "ok" : "down";
  return <span className={`topbar-dot topbar-dot-${state}`} aria-hidden />;
}

export default function AppTopBar({
  health,
  activeTab,
  investigationOpen,
  historyOpen,
  helpOpen,
  onGoHome,
  onOpenLab,
  onToggleHistory,
  onOpenHelp,
}: Props) {
  const pending = health == null;
  const askActive = activeTab === "investigate" && !investigationOpen && !historyOpen;
  const labActive = investigationOpen && activeTab === "investigate" && !historyOpen;

  return (
    <header className="app-topbar">
      <button type="button" className="app-topbar-brand" onClick={onGoHome} aria-label="Beamline home">
        <LogoMark className="app-topbar-mark" />
        <span className="app-topbar-name">Beamline</span>
        <span className="app-topbar-partner">CERN Open Data</span>
      </button>

      <nav className="app-topbar-nav" aria-label="Primary">
        <button
          type="button"
          className={askActive ? "topbar-link is-active" : "topbar-link"}
          aria-current={askActive ? "page" : undefined}
          onClick={onGoHome}
        >
          Ask
        </button>
        <button
          type="button"
          className={labActive ? "topbar-link is-active" : "topbar-link"}
          aria-current={labActive ? "page" : undefined}
          onClick={onOpenLab}
        >
          Lab
        </button>
      </nav>

      <div className="app-topbar-end">
        <div className="app-topbar-status" aria-label="Service status">
          <span title={health?.cern_api === "ok" ? "CERN catalog online" : "CERN catalog offline"}>
            <Dot ok={health?.cern_api === "ok"} pending={pending} />
            Catalog
          </span>
          <span title={health?.ollama === "ok" ? "Model online" : "Model offline"}>
            <Dot ok={health?.ollama === "ok"} pending={pending} />
            Model
          </span>
          <span title={health?.investigation?.sample_prepared ? "Dimuon sample staged" : "Sample missing"}>
            <Dot ok={Boolean(health?.investigation?.sample_prepared)} pending={pending} />
            Sample
          </span>
        </div>
        <button
          type="button"
          className={historyOpen ? "topbar-ghost is-active" : "topbar-ghost"}
          aria-pressed={historyOpen}
          onClick={onToggleHistory}
        >
          History
        </button>
        <button
          type="button"
          className={helpOpen ? "topbar-ghost is-active" : "topbar-ghost"}
          aria-pressed={helpOpen}
          onClick={onOpenHelp}
        >
          Help
        </button>
      </div>
    </header>
  );
}
