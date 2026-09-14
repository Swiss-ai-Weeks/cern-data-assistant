import type { ReactNode } from "react";
import type { DashTab } from "../../layouts/DashboardShell";
import {
  DatasetIcon,
  FilePlusIcon,
  HelpIcon,
  HistoryIcon,
  HomeIcon,
  SearchIcon,
} from "../icons/BeamlineIcons";

interface Props {
  activeTab: DashTab;
  historyOpen: boolean;
  onTabChange: (tab: DashTab) => void;
  onNewInvestigation: () => void;
  onToggleHistory: () => void;
  onFocusComposer: () => void;
  onOpenHelp: () => void;
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
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function DockDivider() {
  return <div className="dock-divider" aria-hidden />;
}

export default function BottomDock({
  activeTab,
  historyOpen,
  onTabChange,
  onNewInvestigation,
  onToggleHistory,
  onFocusComposer,
  onOpenHelp,
  helpOpen,
}: Props) {
  const homeActive = activeTab === "investigate" && !historyOpen;

  return (
    <div className="bottom-dock-wrap">
      <nav className="bottom-dock" aria-label="Main navigation">
        <div className="dock-group dock-group-start">
          <DockBtn label="Home — investigate" active={homeActive} onClick={() => onTabChange("investigate")}>
            <HomeIcon />
          </DockBtn>
        </div>

        <DockDivider />

        <div className="dock-group dock-group-mid">
          <DockBtn label="New investigation" onClick={onNewInvestigation}>
            <FilePlusIcon />
          </DockBtn>
          <DockBtn
            label="Datasets"
            active={activeTab === "datasets" && !historyOpen}
            onClick={() => onTabChange("datasets")}
          >
            <DatasetIcon />
          </DockBtn>
          <DockBtn label="Search — ask a question" onClick={onFocusComposer}>
            <SearchIcon />
          </DockBtn>
        </div>

        <DockDivider />

        <div className="dock-group dock-group-end">
          <DockBtn label="Conversation history" active={historyOpen} onClick={onToggleHistory}>
            <HistoryIcon />
          </DockBtn>
          <DockBtn label="Help" active={helpOpen} onClick={onOpenHelp}>
            <HelpIcon />
          </DockBtn>
        </div>
      </nav>
    </div>
  );
}
