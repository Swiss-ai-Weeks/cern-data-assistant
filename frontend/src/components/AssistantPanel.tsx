import { FormEvent, useState } from "react";
import { runAssistant } from "../api";
import type { AssistantResponse } from "../types";
import ResultsFeed from "./ResultsFeed";
import AnswerCard from "./AnswerCard";

const EXAMPLES = [
  "proton-proton collisions at 13 TeV with muons",
  "Why does CMS use a solenoid?",
  "ATLAS data about the Higgs boson",
  "What is the difference between AOD, MiniAOD and NanoAOD?",
];

export default function AssistantPanel() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantResponse | null>(null);

  async function run(query: string) {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await runAssistant(query.trim()));
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
            placeholder="Ask anything — find datasets or ask about CERN. It auto-routes."
            autoFocus
          />
          <button className="console-submit" type="submit" disabled={loading}>
            {loading ? "Working…" : "Go"}
          </button>
        </div>
        {result && (
          <div className="console-meta">
            <span>
              routed to <strong>{result.mode === "search" ? "dataset search" : "grounded answer"}</strong>
            </span>
            <span>confidence <strong>{result.route_confidence}</strong></span>
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
          routing your request…
        </div>
      )}

      {!loading && result && result.mode === "search" && <ResultsFeed result={result} />}
      {!loading && result && result.mode === "ask" && <AnswerCard result={result} />}
    </div>
  );
}
