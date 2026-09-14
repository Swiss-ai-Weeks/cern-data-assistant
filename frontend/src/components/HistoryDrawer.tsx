import type { RefObject } from "react";
import type { AgentResponse } from "../types";

export type HistoryTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  live: boolean;
  result: AgentResponse | null;
  error: string | null;
  steps: string[];
};

interface Props {
  open: boolean;
  onClose: () => void;
  turns: HistoryTurn[];
  stageAsstId: string | null;
  onFocusTurn: (id: string) => void;
  followups: string[];
  busy: boolean;
  onFollowup: (q: string) => void;
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: () => void;
  scroller: RefObject<HTMLDivElement | null>;
}

export default function HistoryDrawer({
  open,
  onClose,
  turns,
  stageAsstId,
  onFocusTurn,
  followups,
  busy,
  onFollowup,
  value,
  onValueChange,
  onSubmit,
  scroller,
}: Props) {
  if (!open) return null;

  return (
    <div className="history-root">
      <button type="button" className="drawer-backdrop" aria-label="Close history" onClick={onClose} />
      <aside className="history-panel" role="dialog" aria-modal="true" aria-label="Investigation history">
        <header className="drawer-head">
          <h2 className="thread-head-title">History</h2>
          <button type="button" className="drawer-close" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="thread-scroll" ref={scroller as RefObject<HTMLDivElement>}>
          {turns.length === 0 && <p className="thread-empty">No investigations yet.</p>}
          {turns.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`msg ${t.role} ${t.id === stageAsstId ? "on-stage" : ""}`}
              onClick={() => onFocusTurn(t.id)}
            >
              <div className="msg-who">{t.role === "user" ? "You" : "Beamline"}</div>
              {t.role === "user" ? (
                <p>{t.text}</p>
              ) : (
                <p className="msg-asst">
                  {t.live
                    ? t.steps[t.steps.length - 1] || "Planning…"
                    : t.result?.answer?.answer
                      ? t.result.answer.answer.slice(0, 120) + "…"
                      : t.result?.search
                        ? `${t.result.search.returned} datasets`
                        : t.error || "Done."}
                </p>
              )}
            </button>
          ))}
        </div>
        {followups.length > 0 && !busy && (
          <div className="followups">
            {followups.map((q) => (
              <button key={q} type="button" className="follow-chip" onClick={() => onFollowup(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <textarea
            className="composer-input input-base"
            rows={2}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="Follow-up…"
            disabled={busy}
            aria-label="Follow-up query"
          />
          <button className="btn-primary" type="submit" disabled={busy || !value.trim()}>
            Send
          </button>
        </form>
      </aside>
    </div>
  );
}
