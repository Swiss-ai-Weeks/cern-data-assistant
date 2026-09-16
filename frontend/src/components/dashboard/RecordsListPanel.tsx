import { constraintFitLabel } from "../../lib/constraintFitLabel";
import { glanceFromRecord } from "../../lib/recordVisual";
import type { RecordSummary } from "../../types";
import Panel from "../ui/Panel";

interface Props {
  records: RecordSummary[];
  heroRecid?: number | string | null;
  onOpen: (recid: number | string) => void;
}

export default function RecordsListPanel({ records, heroRecid, onOpen }: Props) {
  return (
    <Panel title="Relevant CERN records">
      {records.length === 0 ? (
        <p className="dash-muted">Catalog matches will appear here after search.</p>
      ) : (
        <ul className="records-list">
          {records.slice(0, 6).map((r) => {
            const top = heroRecid != null && String(r.recid) === String(heroRecid);
            const g = glanceFromRecord(r);
            const fit = constraintFitLabel(r.constraint_fit);
            return (
              <li key={r.recid}>
                <button
                  type="button"
                  className={`record-row-btn ${top ? "top" : ""}`}
                  onClick={() => onOpen(r.recid)}
                >
                  <span className="tnum record-recid-tag">{r.recid}</span>
                  <span className="record-row-body">
                    <strong>{r.experiment || "CERN"}</strong>
                    <span className="record-row-title">{g.headline}</span>
                    <span className="record-row-meta tnum">
                      {[g.energyLabel !== "—" ? g.energyLabel : null, g.runLabel !== "—" ? g.runLabel : null, g.sizeLabel !== "—" ? g.sizeLabel : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {r.constraint_fit && (
                      <span className={`record-constraint-fit ${fit.tone}`}>{fit.label}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
