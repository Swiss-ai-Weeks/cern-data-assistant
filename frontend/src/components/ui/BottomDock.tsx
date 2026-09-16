import type { ReactNode } from "react";
import type { DashTab } from "../../layouts/DashboardShell";
import { GridIcon, HelpIcon, HistoryIcon, HomeIcon } from "../icons/BeamlineIcons";

interface Props {
  activeTab: DashTab;
  historyOpen: boolean;
  investigationOpen: boolean;
  onTabChange: (tab: DashTab) => void;
  onNewInvestigation: () => void;
  onToggleHistory: () => void;
  onOpenHelp: () => void;
  onGoHome: () => void;
  onOpenLab: () => void;
  helpOpen: boolean;
}

function DockBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`dock-btn ${active ? "dock-btn-active" : ""}`}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {children}
      <span className="dock-btn-label">{label}</span>
    </button>
  );
}

export default function BottomDock({
  activeTab,
  historyOpen,
  investigationOpen,
  onToggleHistory,
  onOpenHelp,
  onGoHome,
  onOpenLab,
  helpOpen,
}: Props) {
  const askActive = activeTab === "investigate" && !investigationOpen && !historyOpen;
  const labActive = investigationOpen && activeTab === "investigate" && !historyOpen;

  return (
    <div className="bottom-dock-wrap">
      <nav className="bottom-dock" aria-label="Main navigation">
        <DockBtn label="Ask" active={askActive} onClick={onGoHome}>
          <HomeIcon />
        </DockBtn>
        <DockBtn label="Lab" active={labActive} onClick={onOpenLab}>
          <GridIcon />
        </DockBtn>
        <DockBtn label="History" active={historyOpen} onClick={onToggleHistory}>
          <HistoryIcon />
        </DockBtn>
        <DockBtn label="Help" active={helpOpen} onClick={onOpenHelp}>
          <HelpIcon />
        </DockBtn>
      </nav>
    </div>
  );
}
