import { useState } from "react";
import { catalogPlainText } from "../lib/catalogText";
import { downloadNotebook } from "../lib/notebook";
import type { HealthResponse, RecordSummary, SearchResponse } from "../types";

interface Props {
  record: RecordSummary;
  search: SearchResponse | null;
  health: HealthResponse | null;
  alternates?: RecordSummary[];
  variant?: "beamline" | "handoff";
  onOpen?: () => void;
}

export default function ResearchPassport({
  record,
  search,
  health,
  alternates = [],
  variant = "beamline",
  onOpen,
}: Props) {
  const [copied, setCopied] = useState(false);
  const cmd = record.usage || `cernopendata-client download-files --recid ${record.recid}`;
  const portal = record.url || `https://opendata.cern.ch/record/${record.recid}`;
  const formatLabel = record.formats?.length ? record.formats.join(", ") : record.subtype || "—";
  const catalogLive = health?.cern_api === "ok" && Boolean(search?.results?.length);
  const broadened = search?.broadened;
  const missingMeta = !record.experiment && !record.collision_energy && !record.size;
  const title = catalogPlainText(record.title);
  const abstract = record.abstract ? catalogPlainText(record.abstract, 420) : "";

  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const isBeamline = variant === "beamline";

  return (
    <article
      className={`passport ${isBeamline ? "passport-beamline" : "passport-handoff"}`}
      aria-label={`Research passport recid ${record.recid}`}
    >
      {!isBeamline && (
        <div className="passport-stub" aria-hidden>
          <span>CERN</span>
          <span className="passport-barcode" />
          <span className="passport-stub-recid">{record.recid}</span>
        </div>
      )}

      <div className="passport-body-inner">
        {broadened && (
          <div className="passport-banner warn" role="status">
            Broadened search — related records after no exact catalog match.
          </div>
        )}
        {health?.cern_api === "unreachable" && (
          <div className="passport-banner down" role="status">
            CERN catalog unreachable — verify recid on the portal before download.
          </div>
        )}
        {missingMeta && (
          <div className="passport-banner warn" role="status">
            Partial metadata from catalog — open the portal for full fields.
          </div>
        )}

        <div className="passport-header-row">
          <div className="passport-header-main">
            <p className="microlabel">Dataset handoff</p>
            <div className="passport-header-badges">
              <span className="passport-recid-pill">recid {record.recid}</span>
              {record.experiment && <span className="experiment-badge">{record.experiment}</span>}
            </div>
          </div>
          {catalogLive && (
            <span className="live-badge" title="Returned from live CERN Open Data API">
              Live
            </span>
          )}
        </div>

        <h2 className="passport-title">{title}</h2>

        <div className="passport-meta-table">
          <MetaCell label="Collision type" value={record.collision_type || "—"} />
          <MetaCell label="√s" value={record.collision_energy || "—"} />
          <MetaCell label="Run period" value={record.run_period || record.date_published || "—"} />
          <MetaCell label="Size" value={record.size || "—"} />
          <MetaCell label="Files" value={record.file_count != null ? String(record.file_count) : "—"} />
          <MetaCell label="Format" value={formatLabel} />
        </div>

        {record.doi && (
          <p className="passport-doi">
            DOI{" "}
            <a href={`https://doi.org/${record.doi}`} target="_blank" rel="noreferrer">
              {record.doi}
            </a>
          </p>
        )}

        {(record.why || record.relevance != null) && (
          <section className="passport-fit">
            <p className="microlabel">Why this matches</p>
            <p>
              {record.why
                ? catalogPlainText(record.why, 280)
                : record.relevance != null
                  ? `Ranked from live catalog metadata (relevance ${Math.round(record.relevance * 100)}%).`
                  : "Top dataset match from search and ranking."}
            </p>
          </section>
        )}

        {abstract && (
          <section className="passport-fit muted">
            <p className="microlabel">Catalog abstract</p>
            <p className="passport-abstract">{abstract}</p>
          </section>
        )}

        <div className="passport-cmd-block">
          <pre>{cmd}</pre>
          <button
            type="button"
            className={`send-btn copy-float ${copied ? "copied" : ""}`}
            onClick={copyCmd}
            aria-live="polite"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="pass-actions">
          <a className="btn-passport" href={portal} target="_blank" rel="noreferrer">
            Open portal
          </a>
          {onOpen && (
            <button type="button" className="btn-passport" onClick={onOpen}>
              Inspect files
            </button>
          )}
          <button
            type="button"
            className="btn-passport btn-passport-muted"
            onClick={() =>
              downloadNotebook({
                recid: record.recid,
                title,
                url: portal,
                usage: cmd,
                experiment: record.experiment,
                doi: record.doi,
              })
            }
          >
            Export notebook
          </button>
        </div>

        {record.license && (
          <p className="passport-license">
            License: <strong>{record.license}</strong>
          </p>
        )}

        {alternates.length > 0 && (
          <section className="passport-alts">
            <p className="microlabel">Close alternatives</p>
            <ul>
              {alternates.slice(0, 3).map((a) => (
                <li key={a.recid}>
                  <span className="mono">{a.recid}</span> — {catalogPlainText(a.title, 120)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}

function MetaCell({ label, value, span }: { label: string; value: string; span?: number }) {
  return (
    <div
      className={`passport-meta-cell ${span === 2 ? "span-2" : ""} ${span === 3 ? "span-3" : ""}`}
    >
      <span className="cell-label">{label}</span>
      <span className="cell-value">{value}</span>
    </div>
  );
}
