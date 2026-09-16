import { glanceFromRecord, parseSizeBytes } from "../../lib/recordVisual";
import type { RecordSummary } from "../../types";

interface Props {
  records: RecordSummary[];
  heroRecid?: number | string | null;
  onOpen: (recid: number | string) => void;
}

export default function OtherRecordsList({ records, heroRecid, onOpen }: Props) {
  const rest = records.filter((r) => heroRecid == null || String(r.recid) !== String(heroRecid));
  if (rest.length === 0) return null;

  const maxBytes = Math.max(...rest.map((r) => parseSizeBytes(r) ?? 0), 0);

  return (
    <details className="beamline-card beamline-other-records" aria-label="Other catalog matches">
      <summary>
        <span>Other catalog matches</span>
        <strong>{rest.length}</strong>
      </summary>
      <ul className="other-records-list">
        {rest.slice(0, 5).map((r) => {
          const g = glanceFromRecord(r);
          const bytes = parseSizeBytes(r) ?? 0;
          const width = maxBytes > 0 && bytes > 0 ? Math.max(8, Math.round((bytes / maxBytes) * 100)) : null;
          return (
            <li key={r.recid}>
              <button type="button" className="other-record-btn" onClick={() => onOpen(r.recid)}>
                <span className="other-record-recid tnum">{r.recid}</span>
                <span className="other-record-body">
                  <span className="other-record-title">{g.headline}</span>
                  <span className="other-record-meta">
                    {[r.experiment, g.energyLabel !== "—" ? g.energyLabel : null, g.sizeLabel !== "—" ? g.sizeLabel : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {width != null && (
                    <span className="other-record-track" aria-hidden>
                      <span className="other-record-fill" style={{ width: `${width}%` }} />
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
