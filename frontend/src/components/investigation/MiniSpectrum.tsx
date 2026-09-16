export default function MiniSpectrum({ histogram }: { histogram: { counts: number[] } }) {
  const counts = histogram.counts;
  const max = Math.max(1, ...counts);
  const w = 320;
  const h = 72;
  const barW = w / counts.length;
  return (
    <svg className="iv-mini-spectrum" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Miniature mass spectrum from computed run">
      {counts.map((n, i) => {
        const bh = (n / max) * (h - 8);
        return (
          <rect
            key={i}
            x={i * barW}
            y={h - bh}
            width={Math.max(1, barW - 0.2)}
            height={bh}
            className={i >= 28 && i < 33 ? "iv-mini-bar-feature" : "iv-mini-bar"}
          />
        );
      })}
    </svg>
  );
}
