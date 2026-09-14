import { useEffect, useMemo, useRef, useState } from "react";
import { getRecord } from "../api";
import { downloadNotebook } from "../lib/notebook";
import { useOverlayA11y } from "../hooks/useOverlayA11y";
import { usePresence } from "../hooks/usePresence";
import type { RecordDetail } from "../types";
import ResultRow from "./ResultRow";

interface Props {
  recid: number | string | null;
  onClose: () => void;
}

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function RecordDrawer({ recid, onClose }: Props) {
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const open = recid != null;
  const { shown, motion } = usePresence(open);
  useOverlayA11y(open, onClose, panelRef);

  useEffect(() => {
    if (recid == null) return;
    setLoading(true);
    setError(null);
    setDetail(null);
    setFilter("");
    getRecord(recid)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load record."))
      .finally(() => setLoading(false));
  }, [recid]);

  const files = useMemo(() => {
    const list = detail?.files ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) => f.filename.toLowerCase().includes(q));
  }, [detail?.files, filter]);

  const cmd =
    detail?.usage || (recid != null ? `cernopendata-client download-files --recid ${recid}` : "");
  const portal =
    detail?.url || (recid != null ? `https://opendata.cern.ch/record/${recid}` : "#");

  async function copyCmd() {
    if (!cmd) return;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (!shown) return null;

  return (
    <div className="drawer-root overlay-shell" data-motion={motion}>
      <button type="button" className="drawer-backdrop" aria-label="Close record archive" onClick={onClose} />
      <aside ref={panelRef} className="drawer archive-drawer" role="dialog" aria-modal="true" aria-label="CERN record archive">
        <header className="drawer-head">
          <div>
            <div className="drawer-kicker">CERN Open Data archive · recid {recid}</div>
            <h2>{detail?.title || (loading ? "Loading record…" : "Record")}</h2>
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
              Fetching from CERN catalog
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
              {detail.citation && <p className="drawer-license">{detail.citation}</p>}
              {detail.files && detail.files.length > 0 && (
                <div className="file-list">
                  <span className="label">File archive ({detail.files.length})</span>
                  {detail.files.length > 8 && (
                    <input
                      type="search"
                      className="file-filter"
                      placeholder="Filter files…"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      aria-label="Filter files"
                    />
                  )}
                  <div className="file-archive">
                    <div className="file-archive-head">
                      <span>Filename</span>
                      <span>Size</span>
                    </div>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {files.slice(0, 80).map((f) => (
                        <li key={f.filename} className="file-row">
                          <span className="file-name">
                            {f.uri ? (
                              <a href={f.uri} target="_blank" rel="noreferrer">
                                {f.filename}
                              </a>
                            ) : (
                              f.filename
                            )}
                          </span>
                          <span className="file-size mono">{formatBytes(f.size)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {detail && (
          <footer className="drawer-sticky-actions">
            <button type="button" className="send-btn" onClick={copyCmd}>
              {copied ? "Copied" : "Copy download command"}
            </button>
            <a className="ghost-btn pass-link" href={portal} target="_blank" rel="noreferrer">
              Portal
            </a>
            <button
              type="button"
              className="ghost-btn"
              onClick={() =>
                downloadNotebook({
                  recid: detail.recid,
                  title: detail.title,
                  url: portal,
                  usage: cmd,
                  experiment: detail.experiment,
                  doi: detail.doi,
                })
              }
            >
              Notebook
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}
