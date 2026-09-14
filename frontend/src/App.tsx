import { useEffect, useState } from "react";
import { checkHealth, searchDatasets } from "./api";
import type { HealthResponse, SearchResponse } from "./types";
import StatusBar from "./components/StatusBar";
import SearchConsole from "./components/SearchConsole";
import ResultsFeed from "./components/ResultsFeed";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  async function handleSearch(query: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await searchDatasets(query);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">Beamline</h1>
          <p className="app-subtitle">
            Ask in plain language. A local model turns it into a search of the
            CERN Open Data portal and ranks what comes back.
          </p>
        </div>
        <StatusBar health={health} />
      </header>

      <SearchConsole onSubmit={handleSearch} loading={loading} lastResult={result} />

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="loading-state">
          <div className="loading-bar" />
          querying opendata.cern.ch{health?.ollama === "ok" ? " and ranking with " + health.ollama_model : ""}
        </div>
      )}

      {!loading && !error && !result && (
        <div className="empty-state">
          Nothing searched yet. Try one of the examples above, or describe a
          dataset — an experiment, a particle, a collision energy, a data
          format — and Beamline will do the rest.
        </div>
      )}

      {!loading && result && <ResultsFeed result={result} />}
    </div>
  );
}
