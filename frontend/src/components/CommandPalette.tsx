import { useRef } from "react";
import { useOverlayA11y } from "../hooks/useOverlayA11y";
import { usePresence } from "../hooks/usePresence";

interface Props {
  open: boolean;
  onClose: () => void;
  onNewInvestigation: () => void;
  onOpenTrust: () => void;
  onOpenHelp: () => void;
  onOpenAbout?: () => void;
}

const SHORTCUTS = [
  { keys: "Enter", desc: "Send query" },
  { keys: "Shift + Enter", desc: "New line in query" },
  { keys: "Ctrl + K", desc: "Open this menu" },
  { keys: "?", desc: "Trust & safety" },
  { keys: "Esc", desc: "Close panels" },
];

export default function CommandPalette({
  open,
  onClose,
  onNewInvestigation,
  onOpenTrust,
  onOpenHelp,
  onOpenAbout,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const { shown, motion } = usePresence(open);
  useOverlayA11y(open, onClose, panelRef);

  if (!shown) return null;

  return (
    <div className="palette-root overlay-shell" data-motion={motion}>
      <button type="button" className="drawer-backdrop" aria-label="Close menu" onClick={onClose} />
      <aside
        ref={panelRef}
        className="palette-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="palette-title"
      >
        <h2 id="palette-title" className="palette-title">
          Menu
        </h2>
        <div className="palette-actions">
          <button
            type="button"
            className="palette-action"
            onClick={() => {
              onNewInvestigation();
              onClose();
            }}
          >
            New investigation
          </button>
          <button
            type="button"
            className="palette-action"
            onClick={() => {
              onOpenHelp();
              onClose();
            }}
          >
            Help
          </button>
          <button
            type="button"
            className="palette-action"
            onClick={() => {
              onOpenTrust();
              onClose();
            }}
          >
            Trust &amp; safety
          </button>
          {onOpenAbout && (
            <button
              type="button"
              className="palette-action"
              onClick={() => {
                onOpenAbout();
                onClose();
              }}
            >
              About Beamline
            </button>
          )}
        </div>
        <ul className="palette-shortcuts">
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd>
              <span>{s.desc}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
