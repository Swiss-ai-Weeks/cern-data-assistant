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
                    <span className="record-row-title">{r.title}</span>
                    <span className="record-row-meta tnum">
                      {[r.collision_energy, r.run_period || r.date_published, r.file_count != null ? `${r.file_count} files` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
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
