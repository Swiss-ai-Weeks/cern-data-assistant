import type { RecordSummary } from "../types";

interface Props {
  record: RecordSummary;
  showRelevance: boolean;
}

export default function ResultRow({ record, showRelevance }: Props) {
  return (
    <div className="record-row">
      <div className="record-recid">
        <span className="label">recid</span>
        {record.recid}
      </div>

      <div>
        <h3 className="record-title">
          <a href={record.url} target="_blank" rel="noreferrer">
            {record.title}
          </a>
        </h3>

        <div className="record-stats">
          <div className="stat">
            <span className="label">Experiment</span>
            <span className="value">{record.experiment}</span>
          </div>
          <div className="stat">
            <span className="label">Type</span>
            <span className="value">{record.type}</span>
          </div>
          <div className="stat">
            <span className="label">Collision energy</span>
            <span className="value">{record.collision_energy}</span>
          </div>
          <div className="stat">
            <span className="label">Published</span>
            <span className="value">{record.date_published}</span>
          </div>
          <div className="stat">
            <span className="label">Files</span>
            <span className="value">{record.file_count}</span>
          </div>
        </div>

        {record.abstract && <p className="record-abstract">{record.abstract}</p>}

        {showRelevance && record.why && (
          <div className="relevance">
            <div className="relevance-bar">
              <div
                className="relevance-bar-fill"
                style={{ width: `${Math.max(0, Math.min(100, record.relevance ?? 0))}%` }}
              />
            </div>
            <span className="relevance-why">{record.why}</span>
          </div>
        )}

        <a className="record-link" href={record.url} target="_blank" rel="noreferrer">
          View on CERN Open Data
        </a>
      </div>
    </div>
  );
}
