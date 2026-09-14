import { useEffect, useMemo, useState } from "react";
import type { RecordSummary, SearchResponse } from "../types";
import ResultRow from "./ResultRow";

interface Props {
  result: SearchResponse;
  onOpenRecord?: (recid: number | string) => void;
}

type FacetKey = "experiment" | "energy" | "format" | "kind";

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || t === "—" || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function applyFacets(
  records: RecordSummary[],
  selected: Record<FacetKey, string | null>,
): RecordSummary[] {
  return records.filter((r) => {
    if (selected.experiment && r.experiment !== selected.experiment) return false;
    if (selected.energy && r.collision_energy !== selected.energy) return false;
    if (selected.kind && r.kind !== selected.kind) return false;
    if (selected.format && !(r.formats || []).includes(selected.format)) return false;
    return true;
  });
}

export default function ResultsFeed({ result, onOpenRecord }: Props) {
  const [selected, setSelected] = useState<Record<FacetKey, string | null>>({
    experiment: null,
    energy: null,
    format: null,
    kind: null,
  });

  useEffect(() => {
    setSelected({ experiment: null, energy: null, format: null, kind: null });
  }, [result.query, result.search_terms]);

  const options = useMemo(
    () => ({
      experiment: unique(result.results.map((r) => r.experiment)),
      energy: unique(result.results.map((r) => r.collision_energy)),
      format: unique(result.results.flatMap((r) => r.formats || [])),
      kind: unique(result.results.map((r) => r.kind)),
    }),
    [result],
  );

  const visible = applyFacets(result.results, selected);
  const activeCount = Object.values(selected).filter(Boolean).length;

  function toggle(key: FacetKey, value: string) {
    setSelected((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  }

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
          {result.broadened ? " · query broadened to find matches" : ""}
          {result.facets && Object.keys(result.facets).length > 0 && (
            <span className="facets-sent" title="Filters sent to the CERN Open Data API">
              {" · filters: "}
              {Object.entries(result.facets).map(([k, v]) => (
                <code key={k}>{k}={v}</code>
              ))}
            </span>
          )}
        </span>
        <span className="count">
          {visible.length} of {result.total_matches.toLocaleString()}
        </span>
      </div>

      <div className="facet-bar">
        <FacetGroup
          label="Experiment"
          values={options.experiment}
          active={selected.experiment}
          onToggle={(v) => toggle("experiment", v)}
        />
        <FacetGroup
          label="Energy"
          values={options.energy}
          active={selected.energy}
          onToggle={(v) => toggle("energy", v)}
        />
        <FacetGroup
          label="Format"
          values={options.format}
          active={selected.format}
          onToggle={(v) => toggle("format", v)}
        />
        <FacetGroup
          label="Kind"
          values={options.kind}
          active={selected.kind}
          onToggle={(v) => toggle("kind", v)}
        />
        {activeCount > 0 && (
          <button
            type="button"
            className="facet-clear"
            onClick={() =>
              setSelected({ experiment: null, energy: null, format: null, kind: null })
            }
          >
            Clear filters
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          No records match those filters. Clear them to see the full list.
        </div>
      ) : (
        <div className="feed">
          {visible.map((r) => (
            <ResultRow
              key={r.recid}
              record={r}
              showRelevance={result.llm_ranked}
              onOpen={onOpenRecord ? () => onOpenRecord(r.recid) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FacetGroup({
  label,
  values,
  active,
  onToggle,
}: {
  label: string;
  values: string[];
  active: string | null;
  onToggle: (value: string) => void;
}) {
  if (values.length < 2) return null;
  return (
    <div className="facet-group">
      <span className="facet-label">{label}</span>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className={`facet-chip ${active === v ? "active" : ""}`}
          onClick={() => onToggle(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
