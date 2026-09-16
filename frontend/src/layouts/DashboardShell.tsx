import type { ReactNode } from "react";
import type { HealthResponse } from "../types";
import AppTopBar from "../components/ui/AppTopBar";
import BottomDock from "../components/ui/BottomDock";

export type DashTab = "investigate" | "datasets" | "evidence" | "integrity" | "about";

interface Props {
  activeTab: DashTab;
  onTabChange: (tab: DashTab) => void;
  onNewInvestigation: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
  onFocusComposer: () => void;
  onOpenHelp: () => void;
  helpOpen: boolean;
  health: HealthResponse | null;
  investigationOpen: boolean;
  onOpenInvestigation: () => void;
  onGoHome: () => void;
  landing?: boolean;
  children: ReactNode;
}

export default function DashboardShell({
  activeTab,
  onTabChange,
  onNewInvestigation,
  onToggleHistory,
  historyOpen,
  onFocusComposer,
  onOpenHelp,
  helpOpen,
  health,
  investigationOpen,
  onOpenInvestigation,
  onGoHome,
  landing = false,
  children,
}: Props) {
  const shellClass = [
    "dash-app",
    investigationOpen ? "dash-app-lab" : "",
    landing ? "dash-app-landing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <a className="skip-link" href="#main">Skip to content</a>
      <AppTopBar
        health={health}
        activeTab={activeTab}
        investigationOpen={investigationOpen}
        historyOpen={historyOpen}
        helpOpen={helpOpen}
        onGoHome={onGoHome}
        onOpenLab={onOpenInvestigation}
        onToggleHistory={onToggleHistory}
        onFocusComposer={onFocusComposer}
        onOpenHelp={onOpenHelp}
      />
      <div className="dash-main-wrap">
        <main id="main" className="dash-main dash-main-dock motion-page" tabIndex={-1}>
          {children}
        </main>
      </div>
      <BottomDock
        activeTab={activeTab}
        historyOpen={historyOpen}
        investigationOpen={investigationOpen}
        onTabChange={onTabChange}
        onNewInvestigation={onNewInvestigation}
        onToggleHistory={onToggleHistory}
        onOpenHelp={onOpenHelp}
        onGoHome={onGoHome}
        onOpenLab={onOpenInvestigation}
        helpOpen={helpOpen}
      />
    </div>
  );
}
