import { Fragment } from "react";
import type { AskResponse, AskSource } from "../types";

interface Props {
  result: AskResponse;
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
    return { cls: "low", label: "low confidence — weak match in CERN sources" };
  }
  if (result.grounded) {
    const n = result.sources.filter((s) => s.used).length;
    return { cls: "ok", label: `grounded in ${n} CERN source${n === 1 ? "" : "s"}` };
  }
  return { cls: "warn", label: "not grounded — held back" };
}

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

function Receipt({ result }: { result: AskResponse }) {
  const d = result.guardrail_detail;
  const cited = result.sources.filter((s) => s.used);
  return (
    <div className="receipt">
      <p className="microlabel">Grounding receipt</p>
      <ul>
        {result.model_used && <li>model {result.model_used}</li>}
        {d && (
          <li>
            best match {d.top_score} / floor {d.threshold}
          </li>
        )}
        {result.guardrail && <li>rail {result.guardrail}</li>}
        {cited.map((s) => (
          <li key={s.n}>
            [{s.n}]{" "}
            <a href={s.source} target="_blank" rel="noreferrer">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AnswerCard({ result }: Props) {
  const b = badge(result);
  const railLabel = result.guardrail
    ? RAIL_LABEL[result.guardrail] ?? result.guardrail
    : null;
  const d = result.guardrail_detail;
  const draft = result.ungrounded_draft?.trim();

  const body = (
    <>
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

      {result.grounded ? (
        <Receipt result={result} />
      ) : (
        d && (
          <p className="answer-meta">
            best match {d.top_score} / floor {d.threshold}
            {result.model_used ? ` · ${result.model_used} never wrote this` : ""}
          </p>
        )
      )}
    </>
  );

  if (!result.grounded && draft) {
    return (
      <div className="answer-split">
        <div className="draft-col">
          <p className="microlabel">What the GPU wanted to say</p>
          <p className="draft-text">{draft}</p>
          <p className="answer-meta">
            ungrounded · {result.draft_model || "llama3.2"} · no CERN passages
          </p>
        </div>
        <div className="stamp-col">
          <p className="microlabel">Beamline</p>
          {body}
        </div>
      </div>
    );
  }

  return <div className="answer-card">{body}</div>;
}
