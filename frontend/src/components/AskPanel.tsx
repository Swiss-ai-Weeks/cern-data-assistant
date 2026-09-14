import { FormEvent, useState } from "react";
import { askAssistant } from "../api";
import type { AskResponse } from "../types";

const EXAMPLES = [
  "Why does CMS use a solenoid?",
  "What is the difference between AOD, MiniAOD and NanoAOD?",
  "What energy did the LHC run at during Run 2?",
];

export default function AskPanel() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  async function run(question: string) {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await askAssistant(question.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    run(value);
  }

  return (
    <div>
      <form className="console" onSubmit={handleSubmit}>
        <div className="console-input-row">
          <span className="console-prompt">?</span>
          <input
            className="console-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask about CERN experiments, detectors, sensors, or open data…"
            autoFocus
          />
          <button className="console-submit" type="submit" disabled={loading}>
            {loading ? "Thinking…" : "Ask"}
          </button>
        </div>
      </form>

      {!result && !loading && (
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="example-chip"
              onClick={() => {
                setValue(ex);
                run(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="loading-state">
          <div className="loading-bar" />
          retrieving CERN sources and composing a grounded answer…
        </div>
      )}

      {!loading && result && (
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
      )}
    </div>
  );
}
