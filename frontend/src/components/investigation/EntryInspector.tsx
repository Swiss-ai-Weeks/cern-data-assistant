import { useEffect, useState } from 'react';
import type { Entries, VariableDoc } from '../../lib/investigationApi';

export default function EntryInspector({ data, variableDocs = [] }: { data: Entries; variableDocs?: VariableDoc[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [data]);
  const event = data.entries[Math.min(index, data.entries.length-1)];
  return <section className="iv-entry-panel" aria-label="Contributing data entries">
    <div className="iv-panel-heading"><div><p className="iv-eyebrow">From the sample</p><h3>Inside {data.low}–{data.high} GeV</h3></div><span className="iv-pill">{data.total.toLocaleString()} entries</span></div>
    {!event ? <p className="iv-muted">No events in this bin pass the current selection. Try a neighboring bin or loosen the selection.</p> : <>
      <div className="iv-entry-tabs">{data.entries.map((e,i) => <button type="button" key={e.entry} aria-pressed={i===index} onClick={() => setIndex(i)}>Entry {e.entry.toLocaleString()}</button>)}</div>
      <div className="iv-event-detail iv-event-dual">
        <svg viewBox="0 0 220 205" role="img" aria-label="η–φ plane; dot radius scales with muon pT (not to scale).">
          <title>η vs φ · pT-sized markers</title>
          {[ -2, 0, 2 ].map((etaLine) => (
            <line key={etaLine} x1={20 + (etaLine + 2.5) * 36} y1={20} x2={20 + (etaLine + 2.5) * 36} y2={185} className="iv-event-ring" />
          ))}
          {event.muons.map((m, i) => {
            const cx = 20 + (m.eta + 2.5) * 36;
            const cy = 170 - (m.phi + Math.PI) / (2 * Math.PI) * 150;
            const r = Math.min(14, 4 + m.pt / 4);
            return (
              <g key={`eta-${i}`}>
                <circle cx={cx} cy={cy} r={r} className={`iv-muon-dot iv-muon-${i}`} />
                <text x={cx} y={cy - r - 4} textAnchor="middle" className="iv-muon-label">μ{m.charge > 0 ? "+" : "−"}</text>
              </g>
            );
          })}
        </svg>
        <svg viewBox="0 0 220 205" role="img" aria-label="Schematic transverse muon directions, calculated from the selected entry’s azimuthal angles. Arrow length is not a momentum scale.">
          <title>Measured directions · schematic projection</title>
          {[35,60,85].map(r => <circle key={r} cx="110" cy="98" r={r} className="iv-event-ring" />)}
          <line x1="20" y1="98" x2="200" y2="98" className="iv-event-ring" /><line x1="110" y1="8" x2="110" y2="188" className="iv-event-ring" />
          {event.muons.map((m,i) => <g key={i}><line x1="110" y1="98" x2={110+75*Math.cos(m.phi)} y2={98-75*Math.sin(m.phi)} className={`iv-muon iv-muon-${i}`} /><circle cx={110+75*Math.cos(m.phi)} cy={98-75*Math.sin(m.phi)} r="5" className={`iv-muon-dot iv-muon-${i}`} /><text x={110+93*Math.cos(m.phi)} y={98-93*Math.sin(m.phi)+4} textAnchor="middle" className="iv-muon-label">μ{m.charge > 0 ? '+' : '−'}</text></g>)}
          <circle cx="110" cy="98" r="4" fill="currentColor" />
        </svg>
        <div><p className="iv-event-mass">{event.mass.toFixed(3)} <span>GeV</span></p><p className="iv-muted">Reconstructed pair mass</p><table><thead><tr><th>Muon</th><th>pT (GeV)</th><th>η</th><th>φ (rad)</th></tr></thead><tbody>{event.muons.map((m,i) => <tr key={i}><td>μ{m.charge>0 ? '+' : '−'}</td><td>{m.pt.toFixed(2)}</td><td>{m.eta.toFixed(2)}</td><td>{m.phi.toFixed(2)}</td></tr>)}</tbody></table></div>
      </div>
      <p className="iv-caption">Directions use measured φ; detector rings are schematic, not recorded hits. {data.identity} {data.ordering}</p>
      {variableDocs.length > 0 && (
        <div className="iv-variable-docs">
          <p className="iv-eyebrow">What these quantities connect to</p>
          <div className="iv-links">
            {variableDocs.map((doc) => (
              <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer">
                <span>{doc.label}</span>
                {doc.summary} ↗
              </a>
            ))}
          </div>
        </div>
      )}
    </>}
  </section>;
}
