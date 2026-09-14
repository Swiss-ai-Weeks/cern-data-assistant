import { compareTerms } from "../lib/compareDetect";
import type { AskResponse, AskSource } from "../types";

interface Props {
  query: string;
  answer: AskResponse;
}

function sourcesForTerm(term: string, sources: AskSource[]): AskSource[] {
  const t = term.toLowerCase();
  return sources.filter(
    (s) =>
      s.title.toLowerCase().includes(t) ||
      (s.snippet || "").toLowerCase().includes(t) ||
      (s.experiment || "").toLowerCase().includes(t) ||
      t.split(/\s+/).some((w) => w.length > 3 && (s.snippet || s.title).toLowerCase().includes(w)),
  );
}

export default function ComparePanel({ query, answer }: Props) {
  const terms = compareTerms(query);
  const used = answer.sources.filter((s) => s.used);
  const pool = used.length ? used : answer.sources;

  const rows =
    terms.length >= 2
      ? terms.flatMap((term) => {
          const matched = sourcesForTerm(term, pool);
          const list = matched.length ? matched.slice(0, 2) : [null];
          return list.map((src, i) => ({ term: i === 0 ? term : "", src }));
        })
      : pool.slice(0, 4).map((src, i) => ({
          term: i === 0 ? "Compared evidence" : "",
          src,
        }));

  const insufficient = pool.length < 2 || rows.every((r) => !r.src);

  if (insufficient) {
    return (
      <section className="compare-panel compare-empty">
        <p className="microlabel">Compare mode</p>
        <p>
          Insufficient CERN evidence to compare side-by-side for this query. Try narrowing to
          documented formats or detectors.
        </p>
      </section>
    );
  }

  return (
    <section className="compare-panel" aria-label="Evidence comparison">
      <p className="microlabel">Compare — evidence table</p>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col">CERN source</th>
              <th scope="col">Passage</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <th scope="row">{row.term || "—"}</th>
                {row.src ? (
                  <>
                    <td>
                      <a href={row.src.source} target="_blank" rel="noreferrer">
                        [{row.src.n}] {row.src.title}
                      </a>
                    </td>
                    <td className="compare-snippet">{row.src.snippet || "—"}</td>
                    <td className="mono">{row.src.score.toFixed(2)}</td>
                  </>
                ) : (
                  <td colSpan={3}>No matching CERN passage for this term.</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="compare-conclusion">
        <span className="microlabel">Synthesis (check citations in answer)</span>
        {answer.answer.split("\n").slice(-2).join(" ")}
      </p>
      <p className="compare-note">
        Facts in cells come from retrieved CERN pages; conclusions with [n] are tied to those sources.
      </p>
    </section>
  );
}
