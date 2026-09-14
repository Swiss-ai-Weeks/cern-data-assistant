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
  children: ReactNode;
}

export default function DashboardShell({
  activeTab,
  onTabChange,
  onNewInvestigation,
  onToggleHistory,
  historyOpen,
  onFocusComposer,
  children,
}: Props) {
  return (
    <div className="dash-app sky-aurora dash-app-dock">
      <div className="grain" aria-hidden />
      <div className="dash-main-wrap">
        <main className="dash-main dash-main-dock">{children}</main>
      </div>
      <BottomDock
        activeTab={activeTab}
        historyOpen={historyOpen}
        onTabChange={onTabChange}
        onNewInvestigation={onNewInvestigation}
        onToggleHistory={onToggleHistory}
        onFocusComposer={onFocusComposer}
      />
    </div>
  );
}
