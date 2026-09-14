interface Props {
  score: number;
  floor: number;
  label?: string;
}

/** Calibrated instrument readout — score vs retrieval floor */
export default function ScoreGauge({ score, floor, label = "Retrieval" }: Props) {
  const max = Math.max(floor * 1.35, score, 1);
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  const floorPct = Math.min(100, (floor / max) * 100);
  const pass = score >= floor;

  return (
    <div className="score-gauge" role="img" aria-label={`${label}: ${score} versus floor ${floor}`}>
      <div className="score-gauge-head">
        <span className="microlabel">{label}</span>
        <span className={`score-gauge-val ${pass ? "pass" : "fail"}`}>
          {score.toFixed(2)}
          <span className="score-gauge-floor"> / {floor.toFixed(2)} floor</span>
        </span>
      </div>
      <div className="score-gauge-track">
        <div className="score-gauge-fill" style={{ width: `${pct}%` }} />
        <div className="score-gauge-needle" style={{ left: `${floorPct}%` }} title="Evidence floor" />
      </div>
    </div>
  );
}
