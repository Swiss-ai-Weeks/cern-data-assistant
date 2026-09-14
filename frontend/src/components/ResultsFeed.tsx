import type { SearchResponse } from "../types";
import ResultRow from "./ResultRow";

interface Props {
  result: SearchResponse;
}

export default function ResultsFeed({ result }: Props) {
  if (result.results.length === 0) {
    return (
      <div className="empty-state">
        No records matched "{result.search_terms}". Try broader or different
        physics terms — experiment names (CMS, ATLAS, ALICE, LHCb), particles,
        or collision energies tend to work best.
      </div>
    );
  }

  return (
    <div>
      <div className="results-header">
        <span>
          {result.llm_ranked
            ? "Ranked by relevance to your request"
            : "Ordered by CERN Open Data's own relevance score"}
        </span>
        <span className="count">
          {result.returned} of {result.total_matches.toLocaleString()}
        </span>
      </div>
      <div className="feed">
        {result.results.map((r) => (
          <ResultRow key={r.recid} record={r} showRelevance={result.llm_ranked} />
        ))}
      </div>
    </div>
  );
}
