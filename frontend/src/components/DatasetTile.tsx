import type { RecordSummary } from "../types";

interface Props {
  record: RecordSummary;
  onOpen?: () => void;
}

export default function DatasetTile({ record, onOpen }: Props) {
  return (
    <button type="button" className="ds-tile" onClick={onOpen} aria-label={`Open record ${record.recid}`}>
      <div className="ds-tile-top">
        <span className="ds-exp">{record.experiment || "CERN"}</span>
        <span className="ds-recid">{record.recid}</span>
      </div>
      <h3>{record.title}</h3>
      <div className="ds-meta">
        <span>{record.size}</span>
        <span>{record.file_count} files</span>
        {(record.formats || []).slice(0, 2).map((f) => (
          <span key={f} className="ds-fmt">
            {f}
          </span>
        ))}
      </div>
    </button>
  );
}
