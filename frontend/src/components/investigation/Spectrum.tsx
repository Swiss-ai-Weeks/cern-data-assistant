import { useEffect, useRef, useState } from 'react';
import type { ReferenceValidation, Run } from '../../lib/investigationApi';

export default function Spectrum({
  run,
  baseline,
  selectedBin,
  onSelect,
  referenceValidation,
  histogramDelta,
}: {
  run: Run;
  baseline: Run | null;
  selectedBin: number | null;
  onSelect: (bin: number) => void;
  referenceValidation?: ReferenceValidation;
  histogramDelta?: { low: number; high: number; delta: number }[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(650);
  const [hover, setHover] = useState<number | null>(null);
  const [log, setLog] = useState(true);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const left = 54, right = width - 14, bottom = 280, top = 26;
  const max = Math.max(1, ...run.histogram.counts, ...(baseline?.histogram.counts ?? []));
  const ceiling = log ? 10 ** Math.ceil(Math.log10(max + 1)) : Math.ceil(max / 100) * 100;
  const x = (value: number) => left + value / 120 * (right - left);
  const y = (value: number) => bottom - (log ? Math.log10(value + 1) / Math.log10(ceiling + 1) : value / ceiling) * (bottom - top);
  const path = (counts: number[]) => counts.map((n, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(n)} L${x(i + 1)},${y(n)}`).join(' ');
  const tickValues = log ? [0, ...Array.from({length: Math.ceil(Math.log10(ceiling))}, (_, i) => 10 ** (i + 1))] : [0, ceiling / 4, ceiling / 2, ceiling * .75, ceiling];
  const highlighted = hover ?? selectedBin;
  return <div className="iv-spectrum" ref={host}>
    <div className="iv-chart-meta"><span><i className="iv-swatch" /> Current selection {baseline && <><i className="iv-swatch baseline" /> Reference selection</>}</span><button type="button" onClick={() => setLog(!log)} aria-pressed={log}>{log ? 'Log scale' : 'Linear scale'} ↕</button></div>
    <svg width="100%" viewBox={`0 0 ${width} 330`} role="img" aria-label="Computed muon-pair mass spectrum. Select a mass bin using the control below to inspect contributing data entries." onMouseLeave={() => setHover(null)}>
      <title>CMS 2012 · muon-pair invariant mass · real bounded sample</title>
      <defs><clipPath id="iv-plot-clip"><rect x={left} y={top} width={right-left} height={bottom-top} /></clipPath></defs>
      <text x={left} y={13} className="iv-axis-label">Events / 1 GeV {log ? '(log scale)' : ''}</text>
      {tickValues.map(n => <g key={n}><line x1={left} x2={right} y1={y(n)} y2={y(n)} className="iv-gridline" /><text x={left-10} y={y(n)+4} textAnchor="end" className="iv-tick">{n >= 1000 ? `${n/1000}k` : Math.round(n)}</text></g>)}
      <g clipPath="url(#iv-plot-clip)">
        <rect x={x(28)} y={top} width={x(33)-x(28)} height={bottom-top} className="iv-region" />
        <rect x={x(90)} y={top} width={Math.max(2, x(92)-x(90))} height={bottom-top} className="iv-region-z" />
        {histogramDelta?.map((row, i) => row.delta !== 0 ? (
          <rect key={`${row.low}-${i}`} x={x(row.low)} y={top + (bottom-top) * 0.72} width={Math.max(1, x(row.high)-x(row.low))} height={Math.min(18, Math.abs(row.delta))} className={row.delta > 0 ? 'iv-delta-up' : 'iv-delta-down'} opacity={0.35} />
        ) : null)}
        {baseline && <path d={path(baseline.histogram.counts)} className="iv-reference-line" />}
        <path d={path(run.histogram.counts)} className="iv-spectrum-line" />
        {highlighted !== null && <rect x={x(highlighted)} y={top} width={Math.max(2,x(1)-x(0))} height={bottom-top} className="iv-highlight" />}
      </g>
      <rect x={left} y={top} width={right-left} height={bottom-top} fill="transparent" className="iv-plot-target" onMouseMove={event => { const b = event.currentTarget.getBoundingClientRect(); setHover(Math.max(0,Math.min(119, Math.floor((event.clientX-b.left)/b.width*120)))); }} onClick={event => {const b = event.currentTarget.getBoundingClientRect(); onSelect(Math.max(0,Math.min(119,Math.floor((event.clientX-b.left)/b.width*120))));}} />
      {(width < 450 ? [0,40,80,120] : [0,20,40,60,80,100,120]).map(n => <text key={n} x={x(n)} y={bottom+22} textAnchor={n===120 ? 'end' : n===0 ? 'start' : 'middle'} className="iv-tick">{n}</text>)}
      <text x={(left+right)/2} y={bottom+46} textAnchor="middle" className="iv-axis-label">Muon-pair invariant mass (GeV)</text>
    </svg>
    <div className="iv-range-summary" aria-label="Histogram event accounting">
      <span><strong>{run.selected_events.toLocaleString()}</strong> selected</span>
      <span><strong>{run.plotted_events.toLocaleString()}</strong> plotted from 0–120 GeV</span>
      <span><strong>{run.histogram.underflow.toLocaleString()}</strong> below · <strong>{run.histogram.overflow.toLocaleString()}</strong> above</span>
    </div>
    <div className="iv-chart-bottom"><span>{highlighted === null ? 'Click the spectrum to inspect real entries.' : `${highlighted}–${highlighted+1} GeV · ${run.histogram.counts[highlighted].toLocaleString()} events`}</span><label>Inspect bin <select aria-label="Inspect mass bin" value={selectedBin ?? ''} onChange={e => onSelect(Number(e.target.value))}><option value="" disabled>Select…</option>{run.histogram.counts.map((_, i) => <option value={i} key={i}>{i}–{i+1} GeV</option>)}</select></label></div>
    <p className="iv-caption">
      Shaded 28–33 GeV: region discussed in CERN’s reference analysis
      {referenceValidation?.z_visible ? ` · Z peak visible near ${referenceValidation.z_peak_bin_gev} GeV on this sample` : ""}.
      Delta ticks (when comparing) show bin-level event shifts versus the reference run.
    </p>
  </div>;
}
