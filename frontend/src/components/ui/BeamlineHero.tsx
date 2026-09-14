import LogoMark from "../LogoMark";

interface Props {
  compact?: boolean;
}

export default function BeamlineHero({ compact = false }: Props) {
  return (
    <header className={`beamline-hero ${compact ? "beamline-hero-compact" : ""}`}>
      {!compact && <div className="beamline-hero-glow" aria-hidden />}

      <p className="beamline-hero-eyebrow">
        <LogoMark className="beamline-hero-mark" />
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
          Ask in everyday language. Beamline searches the live CERN catalog, answers from indexed
          documentation with citations, and refuses when nothing authoritative supports the claim.
        </p>
      )}
    </header>
  );
}
