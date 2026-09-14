import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onNewInvestigation: () => void;
  onOpenTrust: () => void;
  onOpenAbout?: () => void;
}

const SHORTCUTS = [
  { keys: "Enter", desc: "Submit query" },
  { keys: "Shift+P", desc: "Presenter mode" },
  { keys: "?", desc: "How Beamline earns trust" },
  { keys: "Esc", desc: "Close drawer / palette" },
  { keys: "1 / 2 / 3", desc: "Demo scenes (presenter on)" },
];

export default function CommandPalette({
  open,
  onClose,
  onNewInvestigation,
  onOpenTrust,
  onOpenAbout,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="palette-root">
      <button type="button" className="drawer-backdrop" aria-label="Close command palette" onClick={onClose} />
      <div className="palette-panel" role="dialog" aria-modal="true" aria-labelledby="palette-title">
        <h2 id="palette-title" className="palette-title">
          Command palette
        </h2>
        <div className="palette-actions">
          <button type="button" className="palette-action" onClick={() => { onNewInvestigation(); onClose(); }}>
            New investigation
          </button>
          <button type="button" className="palette-action" onClick={() => { onOpenTrust(); onClose(); }}>
            How Beamline earns trust
          </button>
          {onOpenAbout && (
            <button type="button" className="palette-action" onClick={() => { onOpenAbout(); onClose(); }}>
              About &amp; system status
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
      </div>
    </div>
  );
}
