import type { AskResponse } from "../types";

interface Props {
  result: AskResponse;
}

// Human-readable label for the guardrail that decided this response.
const RAIL_LABEL: Record<string, string> = {
  grounded: "grounding verified",
  "grounded:unverified": "grounded (fact-check offline)",
  "retrieval:no_source": "blocked: no CERN source",
  "citation:none": "blocked: no valid citation",
  "grounding:unsupported": "blocked: unsupported claim",
  "input:injection": "blocked: off-scope request",
  "input:unsafe": "blocked: unsafe request",
};

export default function AnswerCard({ result }: Props) {
  const railLabel = result.guardrail
    ? RAIL_LABEL[result.guardrail] ?? result.guardrail
    : null;

  return (
    <div className="answer-card">
      <div className="answer-badges">
        <span className={`answer-badge ${result.grounded ? "ok" : "warn"}`}>
          {result.grounded ? "grounded in CERN sources" : "not grounded — held back"}
        </span>
        {railLabel && <span className="rail-badge">{railLabel}</span>}
      </div>
      <p className="answer-text">{result.answer}</p>

      {result.sources.length > 0 && (
        <div className="answer-sources">
          <div className="answer-sources-title">Sources</div>
          <ol>
            {result.sources.map((s) => (
              <li key={s.n} className={s.used ? "src-used" : "src-unused"}>
                <a href={s.source} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <span className="src-score">score {s.score}</span>
                {s.used && <span className="src-cited">cited</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
