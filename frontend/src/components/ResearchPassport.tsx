import { useState } from "react";
import { catalogPlainText } from "../lib/catalogText";
import { downloadNotebook } from "../lib/notebook";
import { glanceFromRecord, LHC_TEV, sizeBars } from "../lib/recordVisual";
import type { HealthResponse, RecordSummary, SearchResponse } from "../types";
import CollisionView from "./CollisionView";

interface Props {
  record: RecordSummary;
  search: SearchResponse | null;
  health: HealthResponse | null;
  peers?: RecordSummary[];
  variant?: "beamline" | "handoff";
  onOpen?: () => void;
}

export default function ResearchPassport({
  record,
  search,
  health,
  peers = [],
  variant = "beamline",
  onOpen,
}: Props) {
  const [copied, setCopied] = useState(false);
  const cmd = record.usage || `cernopendata-client download-files --recid ${record.recid}`;
  const portal = record.url || `https://opendata.cern.ch/record/${record.recid}`;
  const catalogLive = health?.cern_api === "ok" && Boolean(search?.results?.length);
  const broadened = search?.broadened;
  const missingMeta = !record.experiment && !record.collision_energy && !record.size;
  const glance = glanceFromRecord(record);
  const chart = sizeBars(peers.length ? peers : [record], record.recid);
  const why = record.why
    ? catalogPlainText(record.why, 160)
    : record.relevance != null
      ? `Top live catalog match (${Math.round(record.relevance * 100)}% relevance).`
      : "";
  const abstract = record.abstract ? catalogPlainText(record.abstract, 140) : "";
  const showAbstract = abstract && (!why || abstract.slice(0, 40) !== why.slice(0, 40));

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
        {search?.investigation_binding && !search.investigation_binding.available && (
          <div className="passport-banner warn" role="status">
            Home investigation stays on CMS 8 TeV record {search.investigation_binding.record_id}. This catalog result does not switch the runnable sample.
          </div>
        )}
        {record.constraint_fit === "catalog_only_adapter" && (
          <div className="passport-banner warn" role="status">
            Record {record.recid} is catalog-supported only — NanoAOD adapter is not wired into the investigation workspace yet.
          </div>
        )}
        {record.constraint_fit === "executable_sample" && (
          <div className="passport-banner ok" role="status">
            This record matches the bounded CMS investigation sample used on the Investigate tab.
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

        <div className="passport-viz" aria-hidden>
          <CollisionView hot compact />
          <div className="passport-viz-overlay">
            <span>{glance.collisionLabel || "collision data"}</span>
            <strong>{glance.energyLabel !== "—" ? glance.energyLabel : glance.headline}</strong>
          </div>
        </div>

        <h2 className="passport-title">{glance.headline}</h2>
        {glance.context && <p className="passport-context">{glance.context}</p>}

        <ul className="passport-kpis">
          <Kpi
            label="Collision energy"
            value={glance.energyLabel}
            bar={glance.energyPct || null}
            hint={glance.energyTev != null ? `of LHC ${LHC_TEV} TeV` : undefined}
          />
          <Kpi label="Volume" value={glance.sizeLabel} />
          <Kpi label="Run" value={glance.runLabel} />
          <Kpi label="Format" value={glance.formatLabel} />
        </ul>

        {chart.length >= 2 && (
          <section className="passport-chart" aria-label="Dataset size in this search">
            <p className="microlabel">Volume in this search</p>
            <ul>
              {chart.map((row) => (
                <li key={String(row.recid)} className={row.current ? "on" : ""}>
                  <span className="passport-chart-label">{row.current ? "This record" : row.label}</span>
                  <div className="passport-chart-track" aria-hidden>
                    <div className="passport-chart-fill" style={{ width: `${row.pct}%` }} />
                  </div>
                  <span className="passport-chart-val tnum">{row.sizeLabel}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {why && (
          <section className="passport-fit passport-takeaway">
            <p className="microlabel">Why this record</p>
            <p className="passport-takeaway-text">{why}</p>
          </section>
        )}

        {showAbstract && (
          <p className="passport-abstract">{abstract}</p>
        )}

        {glance.path && (
          <details className="passport-path">
            <summary>Catalog path</summary>
            <code>{glance.path}</code>
          </details>
        )}

        {record.doi && (
          <p className="passport-doi">
            DOI{" "}
            <a href={`https://doi.org/${record.doi}`} target="_blank" rel="noreferrer">
              {record.doi}
            </a>
          </p>
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
                title: glance.headline,
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
            License {record.license}
          </p>
        )}
      </div>
    </article>
  );
}

function Kpi({
  label,
  value,
  bar,
  hint,
}: {
  label: string;
  value: string;
  bar?: number | null;
  hint?: string;
}) {
  return (
    <li className="passport-kpi">
      <span className="cell-label">{label}</span>
      <strong className="cell-value">{value}</strong>
      {bar != null && bar > 0 && (
        <div className="passport-kpi-track" aria-hidden>
          <div className="passport-kpi-fill" style={{ width: `${bar}%` }} />
        </div>
      )}
      {hint && <span className="passport-kpi-hint">{hint}</span>}
    </li>
  );
}
