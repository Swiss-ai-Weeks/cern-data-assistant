import type { AskResponse } from "../types";

interface Props {
  result: AskResponse;
}

export default function AnswerCard({ result }: Props) {
  return (
    <div className="answer-card">
      <div className={`answer-badge ${result.grounded ? "ok" : "warn"}`}>
        {result.grounded ? "grounded in CERN sources" : "not grounded — no CERN source"}
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
