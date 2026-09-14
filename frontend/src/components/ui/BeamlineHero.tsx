interface Props {
  compact?: boolean;
}

export default function BeamlineHero({ compact = false }: Props) {
  return (
    <header className={`beamline-hero ${compact ? "beamline-hero-compact" : ""}`}>
      {!compact && <div className="beamline-hero-glow" aria-hidden />}

      <p className="beamline-hero-eyebrow">
        <span className="beamline-hero-brand">Beamline</span>
        <span className="beamline-hero-dot" aria-hidden>
          ·
        </span>
        <span className="beamline-hero-partner">CERN Open Data</span>
      </p>

      <h1 className="beamline-hero-title">
        <span className="beamline-hero-line">Find the evidence,</span>
        <span className="beamline-hero-line beamline-hero-accent serif-accent">not just an answer.</span>
      </h1>

      {!compact && (
        <p className="beamline-hero-lede">
          Plain-language search over the live catalog and grounded detector docs — with citations you
          can verify.
        </p>
      )}
    </header>
  );
}
