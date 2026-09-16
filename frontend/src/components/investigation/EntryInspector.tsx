import { useEffect, useState } from 'react';
import type { Entries } from '../../lib/investigationApi';

export default function EntryInspector({data}: {data: Entries}) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [data]);
  const event = data.entries[Math.min(index, data.entries.length-1)];
  return <section className="iv-entry-panel" aria-label="Contributing data entries">
    <div className="iv-panel-heading"><div><p className="iv-eyebrow">FROM THE ACTUAL DATA</p><h3>Inside {data.low}–{data.high} GeV</h3></div><span className="iv-pill">{data.total.toLocaleString()} entries</span></div>
    {!event ? <p className="iv-muted">No events in this bin pass the current selection. Try a neighboring bin or loosen the selection.</p> : <>
      <div className="iv-entry-tabs">{data.entries.map((e,i) => <button type="button" key={e.entry} aria-pressed={i===index} onClick={() => setIndex(i)}>Entry {e.entry.toLocaleString()}</button>)}</div>
      <div className="iv-event-detail">
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
    </>}
  </section>;
}
