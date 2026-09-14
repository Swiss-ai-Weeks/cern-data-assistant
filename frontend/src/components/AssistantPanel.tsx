import { FormEvent, useState } from "react";
import { runAgent } from "../api";
import type { AgentResponse } from "../types";
import ResultsFeed from "./ResultsFeed";
import AnswerCard from "./AnswerCard";

const EXAMPLES = [
  "proton-proton collisions at 13 TeV with muons",
  "Why does CMS use a solenoid?",
  "find CMS muon datasets and explain why CMS uses a solenoid",
  "What is the difference between AOD, MiniAOD and NanoAOD?",
];

export default function AssistantPanel() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResponse | null>(null);

  async function run(query: string) {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await runAgent(query.trim()));
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
          <span className="console-prompt">λ</span>
          <input
            className="console-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask anything — find datasets, ask about CERN, or both. The agent plans it."
            autoFocus
          />
          <button className="console-submit" type="submit" disabled={loading}>
            {loading ? "Working…" : "Go"}
          </button>
        </div>
        {result && (
          <div className="console-meta">
            <span>
              goal: <strong>{result.goal}</strong>
            </span>
            <span className="agent-tools">
              {result.tools_used.length > 0 ? (
                result.tools_used.map((t) => (
                  <span key={t} className="tool-chip">
                    {t === "search" ? "dataset search" : "grounded answer"}
                  </span>
                ))
              ) : (
                <span className="tool-chip">no tools run</span>
              )}
            </span>
          </div>
        )}
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
          planning and running tools…
        </div>
      )}

      {!loading && result && (
        <>
          {result.answer && <AnswerCard result={result.answer} />}
          {result.search && result.search.results.length > 0 && (
            <ResultsFeed result={result.search} />
          )}
          {!result.answer &&
            (!result.search || result.search.results.length === 0) && (
              <div className="empty-state">
                No results for that. Try rephrasing toward a CERN experiment,
                particle, energy, or detector.
              </div>
            )}
        </>
      )}
    </div>
  );
}
