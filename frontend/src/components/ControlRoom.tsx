import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import type { HealthResponse } from "../types";
import { EXAMPLE_QUERIES } from "../lib/starterQueries";
import CollisionView from "./CollisionView";
import SystemStatusStrip from "./SystemStatusStrip";

interface Props {
  health: HealthResponse | null;
  busy: boolean;
  onSubmit: (query: string) => void;
  onOpenTrust?: () => void;
  presenterOn?: boolean;
}

export default function ControlRoom({ health, busy, onSubmit, onOpenTrust, presenterOn }: Props) {
  const [value, setValue] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  function send(raw: string) {
    const q = raw.trim();
    if (!q || busy) return;
    setValue("");
    onSubmit(q);
  }

  function onForm(e: FormEvent) {
    e.preventDefault();
    send(value);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(value);
    }
  }

  return (
    <div className={`control-room ${presenterOn ? "presenter-focus" : ""}`}>
      <div className="control-room-canvas">
        <CollisionView hot={false} telemetry labels />
        <div className="canvas-label">
          <span className="disclosure">
            Conceptual collision visualization — not reconstructed event data
          </span>
        </div>
      </div>

      <div className="control-room-panel">
        <SystemStatusStrip health={health} />

        <p className="control-room-kicker">CERN scientific data console</p>
        <h1 className="control-room-title">
          beamline
        </h1>
        <p className="control-room-promise">
          Real CERN records. Evidence-bound answers. No unsupported science.
        </p>
        <p className="control-room-flow" aria-label="How it works">
          <span>Ask</span>
          <span className="flow-arrow" aria-hidden>
            →
          </span>
          <span>CERN catalog &amp; docs</span>
          <span className="flow-arrow" aria-hidden>
            →
          </span>
          <span>Evidence verification</span>
          <span className="flow-arrow" aria-hidden>
            →
          </span>
          <span>Research handoff</span>
        </p>
        {onOpenTrust && (
          <button type="button" className="how-link" onClick={onOpenTrust}>
            How Beamline earns trust
          </button>
        )}

        <form className="instrument-composer" onSubmit={onForm}>
          <label className="microlabel" htmlFor="control-query">
            Scientific query
          </label>
          <textarea
            id="control-query"
            ref={box}
            className="instrument-input"
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            placeholder="Collisions, datasets, detectors — ask in plain English…"
            disabled={busy}
            autoFocus
          />
          <div className="instrument-bar">
            <span className="composer-hint">{busy ? "Investigating…" : "Enter ↵"}</span>
            <button className="send-btn beam-pulse" type="submit" disabled={busy || !value.trim()}>
              {busy ? "…" : "Investigate"}
            </button>
          </div>
        </form>

        <div className="example-rail" aria-label="Example queries">
          {EXAMPLE_QUERIES.map((q) => (
            <button key={q} type="button" className="example-chip" disabled={busy} onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
