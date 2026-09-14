import { useEffect, useState } from "react";
import { getRecord } from "../api";
import type { RecordDetail } from "../types";
import ResultRow from "./ResultRow";

interface Props {
  recid: number | string | null;
  onClose: () => void;
}

export default function RecordDrawer({ recid, onClose }: Props) {
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (recid == null) return;
    setLoading(true);
    setError(null);
    setDetail(null);
    getRecord(recid)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load record."))
      .finally(() => setLoading(false));
  }, [recid]);

  useEffect(() => {
    if (recid == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recid, onClose]);

  if (recid == null) return null;

  return (
    <div className="drawer-root">
      <button type="button" className="drawer-backdrop" aria-label="Close" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Dataset record">
        <header className="drawer-head">
          <div>
            <div className="drawer-kicker">CERN Open Data · recid {recid}</div>
            <h2>{detail?.title || (loading ? "Loading…" : "Record")}</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">
          {error && <div className="error-banner">{error}</div>}
          {loading && (
            <div className="loading-state">
              <div className="loading-bar" />
              fetching record
            </div>
          )}
          {detail && (
            <>
              <ResultRow record={detail} showRelevance={false} />
              {detail.license && (
                <p className="drawer-license">
                  License: <strong>{detail.license}</strong>
                </p>
              )}
              {detail.files && detail.files.length > 0 && (
                <div className="file-list">
                  <span className="label">All files ({detail.files.length})</span>
                  <ul>
                    {detail.files.slice(0, 40).map((f) => (
                      <li key={f.filename}>
                        {f.uri ? (
                          <a href={f.uri} target="_blank" rel="noreferrer">
                            {f.filename}
                          </a>
                        ) : (
                          f.filename
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
