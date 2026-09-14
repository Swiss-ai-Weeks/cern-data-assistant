import { useState } from "react";
import type { RecordSummary } from "../types";

interface Props {
  record: RecordSummary;
  showRelevance: boolean;
  onOpen?: () => void;
}

export default function ResultRow({ record, showRelevance, onOpen }: Props) {
  return (
    <div
      className={`record-row ${onOpen ? "clickable" : ""}`}
      onClick={(e) => {
        if (!onOpen) return;
        if ((e.target as HTMLElement).closest("a, button, details, input")) return;
        onOpen();
      }}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <div className="record-recid">
        <span className="label">recid</span>
        {record.recid}
      </div>

      <div>
        <h3 className="record-title">
          <a href={record.url} target="_blank" rel="noreferrer">
            {record.title}
          </a>
          <span className={`kind-badge ${record.is_dataset ? "kind-dataset" : "kind-doc"}`}>
            {record.kind}
          </span>
          {record.picked && <span className="picked-badge">fetched</span>}
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
          <div className="stat">
            <span className="label">Size</span>
            <span className="value">{record.size}</span>
          </div>
        </div>

        {record.formats && record.formats.length > 0 && (
          <div className="format-row">
            <span className="label">Format</span>
            {record.formats.map((f) => (
              <span key={f} className="format-chip">
                {f}
              </span>
            ))}
          </div>
        )}

        {record.abstract && <p className="record-abstract">{record.abstract}</p>}

        {record.suggestion && (
          <p className="record-suggestion">
            <span className="label">Suggested use</span>
            {record.suggestion}
          </p>
        )}

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

        {record.files && record.files.length > 0 && (
          <div className="file-list">
            <span className="label">Example files</span>
            <ul>
              {record.files.slice(0, 5).map((f) => (
                <li key={f.filename}>
                  {f.uri ? (
                    <a href={f.uri} target="_blank" rel="noreferrer">
                      {f.filename}
                    </a>
                  ) : (
                    f.filename
                  )}
                  {typeof f.size === "number" && f.size > 0 && (
                    <span className="file-size"> · {f.size.toLocaleString()} B</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {record.is_dataset && (
          <div className="usage-block">
            <span className="label">How to get it</span>
            <code className="usage-cmd">{record.usage}</code>
            <CopyButton text={record.usage} />
          </div>
        )}

        <details className="cite-block">
          <summary>Sources &amp; citation</summary>
          <p className="cite-text">{record.citation}</p>
          {record.doi && (
            <a href={`https://doi.org/${record.doi}`} target="_blank" rel="noreferrer">
              doi.org/{record.doi}
            </a>
          )}
        </details>

        <a className="record-link" href={record.url} target="_blank" rel="noreferrer">
          View on CERN Open Data
        </a>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="copy-btn" onClick={copy}>
      {copied ? "copied" : "copy"}
    </button>
  );
}
