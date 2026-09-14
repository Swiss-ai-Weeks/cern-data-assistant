import { glanceFromRecord } from "../lib/recordVisual";
import type { RecordSummary } from "../types";

interface Props {
  record: RecordSummary;
  onOpen?: () => void;
}

export default function DatasetTile({ record, onOpen }: Props) {
  const g = glanceFromRecord(record);
  return (
    <button type="button" className="ds-tile" onClick={onOpen} aria-label={`Open record ${record.recid}`}>
      <div className="ds-tile-top">
        <span className="ds-exp">{record.experiment || "CERN"}</span>
        <span className="ds-recid">{record.recid}</span>
      </div>
      <h3>{g.headline}</h3>
      <div className="ds-meta">
        <span>{g.sizeLabel}</span>
        {g.energyLabel !== "—" && <span>{g.energyLabel}</span>}
        {g.formatLabel !== "—" && (
          <span className="ds-fmt">
            {g.formatLabel}
          </span>
        )}
      </div>
    </button>
  );
}
