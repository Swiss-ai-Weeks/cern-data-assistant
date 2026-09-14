import { Fragment } from "react";
import type { AskResponse, AskSource } from "../types";

interface Props {
  result: AskResponse;
}

// Human-readable label for the guardrail that decided this response.
const RAIL_LABEL: Record<string, string> = {
  grounded: "grounding verified",
  "grounded:low_confidence": "grounded — weak match, fact-check passed",
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
    return { cls: "low", label: "low confidence — weak match in CERN sources" };
  }
  if (result.grounded) {
    const n = result.sources.filter((s) => s.used).length;
    return { cls: "ok", label: `grounded in ${n} CERN source${n === 1 ? "" : "s"}` };
  }
  return { cls: "warn", label: "not grounded — held back" };
}

/** Render the answer text with every [n] turned into a link to source n. */
function renderAnswer(text: string, sources: AskSource[]) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const parts = text.split(/(\[\d{1,3}\])/g);
  return parts.map((part, i) => {
    const m = /^\[(\d{1,3})\]$/.exec(part);
    if (!m) return <Fragment key={i}>{part}</Fragment>;
    const src = byN.get(Number(m[1]));
    if (!src) return <Fragment key={i}>{part}</Fragment>;
    return (
      <a
        key={i}
        className="cite"
        href={src.source}
        target="_blank"
        rel="noreferrer"
        title={`${src.title}${src.section ? " — " + src.section : ""}`}
      >
        {part}
      </a>
    );
  });
}

export default function AnswerCard({ result }: Props) {
  const b = badge(result);
  const railLabel = result.guardrail
    ? RAIL_LABEL[result.guardrail] ?? result.guardrail
    : null;
  const d = result.guardrail_detail;

  return (
    <div className="answer-card">
      <div className="answer-badges">
        <span className={`answer-badge ${b.cls}`}>{b.label}</span>
        {railLabel && <span className="rail-badge">{railLabel}</span>}
      </div>
      <p className="answer-text">{renderAnswer(result.answer, result.sources)}</p>

      {d?.unsupported && d.unsupported.length > 0 && (
        <div className="answer-unsupported">
          Fact-check flagged: {d.unsupported.join(" · ")}
        </div>
      )}

      {result.sources.length > 0 && (
        <div className="answer-sources">
          <div className="answer-sources-title">Sources (CERN Open Data)</div>
          <ol>
            {result.sources.map((s) => (
              <li key={s.n} className={s.used ? "src-used" : "src-unused"}>
                <a href={s.source} target="_blank" rel="noreferrer">
                  {s.title}
                  {s.section ? ` — ${s.section}` : ""}
                </a>
                {s.experiment && <span className="src-score">{s.experiment}</span>}
                {s.kind === "glossary" && <span className="src-score">glossary</span>}
                <span className="src-score">score {s.score}</span>
                {s.used && <span className="src-cited">cited</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="answer-meta">
        {result.model_used && <span>model {result.model_used}</span>}
        {d && d.top_score > 0 && (
          <span>
            best match {d.top_score} / gate {d.threshold}
            {d.citations_removed > 0 && ` · ${d.citations_removed} invalid citation(s) removed`}
            {(d.sentences_removed ?? 0) > 0 &&
              ` · ${d.sentences_removed} uncited sentence(s) dropped`}
          </span>
        )}
        {result.timing_ms?.llm !== undefined && (
          <span>
            {(((result.timing_ms.llm ?? 0) + (result.timing_ms.verify ?? 0)) / 1000).toFixed(1)} s
          </span>
        )}
      </div>
    </div>
  );
}
