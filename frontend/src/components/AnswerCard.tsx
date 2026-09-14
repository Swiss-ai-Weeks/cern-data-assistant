import { Fragment } from "react";
import type { AskResponse, AskSource } from "../types";

interface Props {
  result: AskResponse;
}

function badge(result: AskResponse): { cls: string; label: string } {
  const status = result.guardrail?.status;
  if (result.grounded && status === "low_confidence") {
    return { cls: "low", label: "low confidence — weak match in CERN sources" };
  }
  if (result.grounded) {
    const n = result.sources.filter((s) => s.used).length;
    return { cls: "ok", label: `grounded in ${n} CERN source${n === 1 ? "" : "s"}` };
  }
  if (status === "refused" || status === "refused_by_model") {
    return { cls: "warn", label: "no answer — not in CERN sources" };
  }
  return { cls: "warn", label: "not grounded — no CERN source cited" };
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
  const g = result.guardrail;

  return (
    <div className="answer-card">
      <div className={`answer-badge ${b.cls}`}>{b.label}</div>
      <p className="answer-text">{renderAnswer(result.answer, result.sources)}</p>

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
        {g && (
          <span>
            best match {g.top_score} / gate {g.threshold}
            {g.citations_removed > 0 && ` · ${g.citations_removed} invalid citation(s) removed`}
          </span>
        )}
        {result.timing_ms?.llm !== undefined && (
          <span>{((result.timing_ms.llm ?? 0) / 1000).toFixed(1)} s</span>
        )}
      </div>
    </div>
  );
}
