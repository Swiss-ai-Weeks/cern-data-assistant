import { Fragment, useMemo, useState } from "react";
import { canShowCompare } from "../lib/compareDetect";
import { citationNums, metricsCanChart, parseAnswerBrief } from "../lib/answerBrief";
import type { AskResponse, AskSource } from "../types";
import ComparePanel from "./ComparePanel";
import GroundingReceipt from "./GroundingReceipt";
import IntegrityRail from "./IntegrityRail";
import ScoreGauge from "./ui/ScoreGauge";

interface Props {
  result: AskResponse;
  query: string;
  onTryGrounded?: (q: string) => void;
  generatedAt?: string | null;
}

function sourceKind(src: AskSource): string {
  if (src.kind === "glossary") return "Glossary";
  if (src.kind === "seed") return "Reference";
  if (src.kind === "doc") return "Documentation";
  return "CERN source";
}

function renderCited(text: string, sources: AskSource[], onCite: (n: number) => void) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const parts = text.split(/(\[\d{1,3}\])/g);
  return parts.map((part, i) => {
    const m = /^\[(\d{1,3})\]$/.exec(part);
    if (!m) return <Fragment key={i}>{part}</Fragment>;
    const src = byN.get(Number(m[1]));
    if (!src) return <Fragment key={i}>{part}</Fragment>;
    return (
      <button
        key={i}
        type="button"
        className="cite inline-cite"
        onClick={() => onCite(src.n)}
        aria-label={`Open source ${src.n}: ${src.title}`}
      >
        {m[1]}
      </button>
    );
  });
}

export default function EvidenceBrief({ result, query, onTryGrounded, generatedAt }: Props) {
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const brief = useMemo(() => parseAnswerBrief(result.answer), [result.answer]);
  const { takeaway, points, metrics, compare } = brief;
  const chartable = metricsCanChart(metrics);
  const maxMetric = Math.max(...metrics.map((m) => m.numeric ?? 0), 0);
  const cited = result.sources.filter((s) => s.used);
  const unused = result.sources.filter((s) => !s.used);
  const sourcePool = cited.length ? cited : result.sources;
  const activeSource = result.sources.find((s) => s.n === activeCite) ?? null;
  const showCompare = compare.length < 2 && canShowCompare(query, result);
  const d = result.guardrail_detail;
  const low = result.guardrail === "grounded:low_confidence";
  const takeawayCites = citationNums(takeaway);

  if (!result.grounded) {
    return (
      <div className="evidence-brief">
        <IntegrityRail result={result} onTryGrounded={onTryGrounded} />
      </div>
    );
  }

  return (
    <div className="evidence-brief brief-board">
      <header className="brief-head">
        <div>
          <p className="microlabel">CERN-grounded answer</p>
          <p className="brief-head-lead">
            {low ? "Limited evidence — only cited claims are shown." : "Verified against indexed CERN documentation."}
          </p>
        </div>
        <div className="brief-head-stats">
          <span className={`answer-badge ${low ? "low" : "ok"}`}>{low ? "Limited" : "Grounded"}</span>
          <span className="brief-src-count">
            {cited.length || sourcePool.length} source{(cited.length || sourcePool.length) === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {d && <ScoreGauge score={d.top_score} floor={d.threshold} label="Evidence strength" />}

      <section className="brief-takeaway" aria-label="Answer in short">
        <p className="microlabel">In short</p>
        <p className="brief-takeaway-text">{renderCited(takeaway, result.sources, setActiveCite)}</p>
        {takeawayCites.length > 0 && (
          <p className="brief-takeaway-cites">
            Tied to {takeawayCites.map((n) => `[${n}]`).join(" ")}
          </p>
        )}
      </section>

      {metrics.length > 0 && (
        <section className="brief-metrics" aria-label="Figures from sources">
          <p className="microlabel">Figures from sources</p>
          <ul className="brief-metric-list">
            {metrics.map((m, i) => {
              const width =
                chartable && m.numeric != null && maxMetric > 0
                  ? Math.max(8, Math.round((m.numeric / maxMetric) * 100))
                  : null;
              return (
                <li key={`${m.label}-${i}`} className="brief-metric">
                  <div className="brief-metric-row">
                    <span className="brief-metric-label">{m.label}</span>
                    <span className="brief-metric-value">
                      {renderCited(m.value, result.sources, setActiveCite)}
                    </span>
                  </div>
                  {width != null && (
                    <div className="brief-metric-track" aria-hidden>
                      <div className="brief-metric-fill" style={{ width: `${width}%` }} />
                    </div>
                  )}
                  {m.cites.length > 0 && (
                    <p className="brief-metric-cites">
                      {renderCited(m.cites.map((n) => `[${n}]`).join(" "), result.sources, setActiveCite)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {points.length > 0 && (
        <ol className="brief-points">
          {points.map((p, i) => (
            <li key={i} className="brief-point">
              <span className="brief-point-n" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="brief-point-body">
                <p>{renderCited(p.text, result.sources, setActiveCite)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {compare.length > 0 && (
        <section className="brief-compare" aria-label="Side by side">
          <p className="microlabel">Side by side</p>
          <ul className={`brief-compare-grid ${compare.length === 2 ? "pair" : ""}`}>
            {compare.map((row, i) => (
              <li key={`${row.item}-${i}`} className="brief-compare-card">
                <p className="brief-compare-item">{row.item}</p>
                <p className="brief-compare-fact">{renderCited(row.fact, result.sources, setActiveCite)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.guardrail_detail?.unsupported && result.guardrail_detail.unsupported.length > 0 && (
        <div className="answer-unsupported">
          Fact-check held back: {result.guardrail_detail.unsupported.join(" · ")}
        </div>
      )}

      <section className="brief-sources" aria-label="CERN sources">
        <p className="microlabel">Sources used</p>
        <ul className="brief-source-list">
          {sourcePool.map((src) => (
            <li key={src.n}>
              <button
                type="button"
                className={`brief-source ${activeCite === src.n ? "on" : ""}`}
                onClick={() => setActiveCite((n) => (n === src.n ? null : src.n))}
                aria-expanded={activeCite === src.n}
              >
                <span className="brief-source-n">[{src.n}]</span>
                <span className="brief-source-copy">
                  <span className="brief-source-title">{src.title}</span>
                  <span className="brief-source-meta">
                    {[src.experiment, sourceKind(src), src.section].filter(Boolean).join(" · ")}
                    {` · ${(src.score * 100).toFixed(0)}% match`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {activeSource && (
        <aside className="citation-drawer brief-passage" aria-label={`Passage from source ${activeSource.n}`}>
          <header>
            <span className="microlabel">Passage [{activeSource.n}]</span>
            <button type="button" className="ghost-btn" onClick={() => setActiveCite(null)}>
              Close
            </button>
          </header>
          <h4>{activeSource.title}</h4>
          {activeSource.section && <p className="cite-section">{activeSource.section}</p>}
          <p className="cite-snippet">{activeSource.snippet || "No excerpt stored for this source."}</p>
          <p className="cite-meta">
            <a href={activeSource.source} target="_blank" rel="noreferrer">
              Open CERN source
            </a>
          </p>
        </aside>
      )}

      {unused.length > 0 && (
        <details className="brief-unused">
          <summary>Retrieved but not cited ({unused.length})</summary>
          <ul>
            {unused.map((s) => (
              <li key={s.n}>
                [{s.n}] {s.title}
              </li>
            ))}
          </ul>
        </details>
      )}

      <GroundingReceipt result={result} generatedAt={generatedAt ?? null} />

      {showCompare && <ComparePanel query={query} answer={result} />}
    </div>
  );
}
