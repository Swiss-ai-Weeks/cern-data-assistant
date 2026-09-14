import { Fragment, useMemo, useState } from "react";
import { canShowCompare } from "../lib/compareDetect";
import type { AskResponse, AskSource } from "../types";
import ComparePanel from "./ComparePanel";
import GroundingReceipt from "./GroundingReceipt";
import IntegrityRail from "./IntegrityRail";

interface Props {
  result: AskResponse;
  query: string;
  onTryGrounded?: (q: string) => void;
  generatedAt?: string | null;
}

const RAIL_LABEL: Record<string, string> = {
  grounded: "grounding verified",
  "grounded:low_confidence": "grounded — weak match, citations required",
  "grounding:low_confidence": "blocked: weak match without a strong citation",
  "grounded:unverified": "grounded (fact-check offline)",
  "retrieval:no_source": "blocked: no CERN source (LLM not called)",
  "model:not_in_sources": "blocked: model found no answer in sources",
  "citation:none": "blocked: no valid citation",
  "grounding:unsupported": "blocked: unsupported claim",
  "input:injection": "blocked: off-scope request",
  "input:unsafe": "blocked: unsafe request",
};

function badge(result: AskResponse): { cls: string; label: string } {
  if (result.grounded && result.guardrail === "grounded:low_confidence") {
    return { cls: "low", label: "limited evidence — weak match in CERN sources" };
  }
  if (result.grounded) {
    const n = result.sources.filter((s) => s.used).length;
    return { cls: "ok", label: `grounded in ${n} CERN source${n === 1 ? "" : "s"}` };
  }
  return { cls: "warn", label: "not grounded — held back" };
}

function CitationChip({
  src,
  active,
  onSelect,
}: {
  src: AskSource;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`cite-chip ${active ? "active" : ""}`}
      onClick={onSelect}
      aria-expanded={active}
    >
      [{src.n}]
    </button>
  );
}

function renderAnswer(text: string, sources: AskSource[], onCite: (n: number) => void) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const parts = text.split(/(\[\d{1,3}\])/g);
  return parts.map((part, i) => {
    const m = /^\[(\d{1,3})\]$/.exec(part);
    if (!m) return <Fragment key={i}>{part}</Fragment>;
    const src = byN.get(Number(m[1]));
    if (!src) return <Fragment key={i}>{part}</Fragment>;
    return (
      <button key={i} type="button" className="cite inline-cite" onClick={() => onCite(src.n)}>
        {part}
      </button>
    );
  });
}

export default function EvidenceBrief({ result, query, onTryGrounded, generatedAt }: Props) {
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const b = badge(result);
  const railLabel = result.guardrail ? RAIL_LABEL[result.guardrail] ?? result.guardrail : null;
  const activeSource = result.sources.find((s) => s.n === activeCite) ?? null;
  const showCompare = canShowCompare(query, result);
  const at = generatedAt ?? null;

  const sentences = useMemo(() => {
    return result.answer
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [result.answer]);

  if (!result.grounded) {
    return (
      <div className="evidence-brief">
        <IntegrityRail result={result} onTryGrounded={onTryGrounded} />
      </div>
    );
  }

  return (
    <div className="evidence-brief">
      <div className="answer-badges">
        <span className={`answer-badge ${b.cls}`}>{b.label}</span>
        {railLabel && <span className="rail-badge">{railLabel}</span>}
      </div>

      <p className="evidence-sourced-note microlabel">
        Statements with [n] are tied to retrieved CERN passages below.
      </p>
      <div className="answer-text evidence-body">{renderAnswer(result.answer, result.sources, setActiveCite)}</div>

      {result.guardrail === "grounded:low_confidence" && (
        <p className="evidence-caution">
          Cautious synthesis: retrieval was in the low-confidence band — only cited sentences are shown.
        </p>
      )}

      {activeSource && (
        <aside className="citation-drawer" aria-label={`Source ${activeSource.n}`}>
          <header>
            <span className="microlabel">Citation [{activeSource.n}]</span>
            <button type="button" className="ghost-btn" onClick={() => setActiveCite(null)}>
              Close
            </button>
          </header>
          <h4>{activeSource.title}</h4>
          {activeSource.section && <p className="cite-section">{activeSource.section}</p>}
          <p className="cite-snippet">{activeSource.snippet || "No snippet stored."}</p>
          <p className="cite-meta">
            <a href={activeSource.source} target="_blank" rel="noreferrer">
              CERN source
            </a>
            {" · "}
            relevance {activeSource.score.toFixed(3)}
            {activeSource.kind && ` · ${activeSource.kind}`}
          </p>
        </aside>
      )}

      <div className="evidence-actions">
        <button type="button" className="ghost-btn" onClick={() => setMapOpen((v) => !v)}>
          {mapOpen ? "Hide evidence map" : "Show evidence map"}
        </button>
      </div>

      {mapOpen && (
        <ul className="evidence-map">
          {sentences.map((sent, i) => {
            const cites = [...sent.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));
            return (
              <li key={i} className={cites.length ? "linked" : "uncited"}>
                <span className="evidence-map-sent">{sent}</span>
                {cites.length > 0 && (
                  <span className="evidence-map-links">
                    {cites.map((n) => {
                      const src = result.sources.find((s) => s.n === n);
                      if (!src) return null;
                      return (
                        <CitationChip
                          key={n}
                          src={src}
                          active={activeCite === n}
                          onSelect={() => setActiveCite(n)}
                        />
                      );
                    })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {result.guardrail_detail?.unsupported && result.guardrail_detail.unsupported.length > 0 && (
        <div className="answer-unsupported">
          Fact-check flagged: {result.guardrail_detail.unsupported.join(" · ")}
        </div>
      )}

      <GroundingReceipt result={result} generatedAt={at} />

      {showCompare && <ComparePanel query={query} answer={result} />}
    </div>
  );
}
