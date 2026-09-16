interface Props {
  onOpenHelp: () => void;
  onOpenTrust: () => void;
}

export default function AppFooter({ onOpenHelp, onOpenTrust }: Props) {
  return (
    <footer className="app-footer">
      <p className="app-footer-copy">
        Beamline uses the{" "}
        <a href="https://opendata.cern.ch" target="_blank" rel="noreferrer">
          CERN Open Data
        </a>{" "}
        portal. Computed counts are not model-generated.
      </p>
      <div className="app-footer-actions">
        <button type="button" className="app-footer-link" onClick={onOpenHelp}>
          Help
        </button>
        <button type="button" className="app-footer-link" onClick={onOpenTrust}>
          Trust &amp; safety
        </button>
      </div>
    </footer>
  );
}
