import { FormEvent, useState } from "react";
import type { SearchResponse } from "../types";

interface Props {
  onSubmit: (query: string) => void;
  loading: boolean;
  lastResult: SearchResponse | null;
}

const EXAMPLES = [
  "fetch me the best datasets on proton collisions",
  "ATLAS data about the Higgs boson",
  "muon detector data from CMS",
];

export default function SearchConsole({ onSubmit, loading, lastResult }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || loading) return;
    onSubmit(value.trim());
  }

  function runExample(text: string) {
    setValue(text);
    onSubmit(text);
  }

  return (
    <div>
      <form className="console" onSubmit={handleSubmit}>
        <div className="console-input-row">
          <span className="console-prompt">&gt;</span>
          <input
            className="console-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Describe the data you're looking for…"
            autoFocus
          />
          <button className="console-submit" type="submit" disabled={loading}>
            {loading ? "Searching…" : "Run search"}
          </button>
        </div>
        {lastResult && (
          <div className="console-meta">
            <span>
              interpreted as <strong>{lastResult.search_terms}</strong>
            </span>
            <span>
              <strong>{lastResult.total_matches.toLocaleString()}</strong> matches on
              opendata.cern.ch
            </span>
            <span>
              ranking:{" "}
              <strong>{lastResult.llm_ranked ? lastResult.model_used : "off"}</strong>
            </span>
          </div>
        )}
      </form>

      {!lastResult && (
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="example-chip"
              onClick={() => runExample(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
