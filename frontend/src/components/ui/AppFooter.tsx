interface Props {
  onOpenHelp: () => void;
  onOpenTrust: () => void;
}

export default function AppFooter({ onOpenHelp, onOpenTrust }: Props) {
  return (
    <footer className="app-footer">
      <p className="app-footer-copy">
        Beamline ·{" "}
        <a href="https://opendata.cern.ch" target="_blank" rel="noreferrer">
          CERN Open Data
        </a>
      </p>
      <div className="app-footer-actions">
        <button type="button" className="app-footer-link" onClick={onOpenHelp}>
          Help
        </button>
        <button type="button" className="app-footer-link" onClick={onOpenTrust}>
          Trust &amp; safety
        </button>
      </div>
      <p className="app-footer-hint microlabel">
        <kbd>Ctrl</kbd>+<kbd>K</kbd> menu · <kbd>?</kbd> trust
      </p>
    </footer>
  );
}
