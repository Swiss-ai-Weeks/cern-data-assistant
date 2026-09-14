import { useState } from "react";
import { downloadNotebook } from "../lib/notebook";
import type { RecordFile } from "../types";

export interface PassRecord {
  recid: number | string;
  title: string;
  experiment?: string;
  collision_energy?: string;
  size?: string;
  file_count?: number;
  formats?: string[];
  doi?: string | null;
  usage?: string;
  citation?: string;
  url?: string;
  files?: RecordFile[];
}

interface Props {
  record: PassRecord;
  onOpen?: () => void;
}

export default function BoardingPass({ record, onOpen }: Props) {
  const [copied, setCopied] = useState(false);
  const cmd =
    record.usage || `cernopendata-client download-files --recid ${record.recid}`;
  const portal = record.url || `https://opendata.cern.ch/record/${record.recid}`;

  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="pass ticket">
      <div className="ticket-stub" aria-hidden>
        <span>CERN</span>
        <span className="ticket-barcode" />
        <strong>{record.recid}</strong>
      </div>
      <div className="ticket-body">
        <header className="pass-head">
          <p className="microlabel">Boarding pass — not a chat reply</p>
          <span className="pass-recid">opendata.cern.ch</span>
        </header>
        <h3 className="pass-title">{record.title}</h3>
        <div className="pass-stats">
          <div className="pass-stat ink">
            <span className="microlabel">Experiment</span>
            <strong>{record.experiment || "CERN"}</strong>
          </div>
          <div className="pass-stat">
            <span className="microlabel">Energy</span>
            <strong>{record.collision_energy || "—"}</strong>
          </div>
          <div className="pass-stat sky">
            <span className="microlabel">Size</span>
            <strong>{record.size || "—"}</strong>
          </div>
          <div className="pass-stat">
            <span className="microlabel">Files</span>
            <strong>{record.file_count ?? "—"}</strong>
          </div>
        </div>
      {record.doi && (
        <p className="pass-doi">
          DOI{" "}
          <a href={`https://doi.org/${record.doi}`} target="_blank" rel="noreferrer">
            {record.doi}
          </a>
        </p>
      )}
      <pre className="pass-cmd">{cmd}</pre>
      <div className="pass-actions">
        <button type="button" className="send-btn" onClick={copyCmd}>
          {copied ? "Copied" : "Copy download"}
        </button>
        <a className="ghost-btn pass-link" href={portal} target="_blank" rel="noreferrer">
          Open portal
        </a>
        <button
          type="button"
          className="ghost-btn"
          onClick={() =>
            downloadNotebook({
              recid: record.recid,
              title: record.title,
              url: portal,
              usage: cmd,
              experiment: record.experiment,
              doi: record.doi,
            })
          }
        >
          Export notebook
        </button>
        {onOpen && (
          <button type="button" className="ghost-btn" onClick={onOpen}>
            Inspect files
          </button>
        )}
      </div>
      {record.files && record.files.length > 0 && (
        <ul className="pass-files">
          {record.files.slice(0, 4).map((f) => (
            <li key={f.filename}>{f.filename}</li>
          ))}
        </ul>
      )}
      {record.citation && <p className="pass-cite">{record.citation}</p>}
      </div>
    </article>
  );
}
