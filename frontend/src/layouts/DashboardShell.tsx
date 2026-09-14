import type { ReactNode } from "react";
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
  children,
}: Props) {
  return (
    <div className="dash-app sky-aurora dash-app-dock">
      <div className="grain" aria-hidden />
      <div className="dash-main-wrap">
        <main id="main" className="dash-main dash-main-dock motion-page" tabIndex={-1}>
          {children}
        </main>
      </div>
      <BottomDock
        activeTab={activeTab}
        historyOpen={historyOpen}
        onTabChange={onTabChange}
        onNewInvestigation={onNewInvestigation}
        onToggleHistory={onToggleHistory}
        onFocusComposer={onFocusComposer}
        onOpenHelp={onOpenHelp}
        helpOpen={helpOpen}
      />
    </div>
  );
}
