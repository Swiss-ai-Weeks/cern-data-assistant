import type { DayOneGate } from "../../lib/investigationApi";

export default function DayOneGateBanner({ gate }: { gate: DayOneGate }) {
  return (
    <div
      className={`iv-day-one-gate ${gate.passed ? "iv-day-one-ok" : "iv-day-one-warn"}`}
      role="status"
    >
      <p className="iv-eyebrow">{gate.passed ? "Sample check passed" : "Sample needs review"}</p>
      <p>{gate.message}</p>
      {!gate.passed && gate.entries_read != null && (
        <p className="iv-caption">
          Staged entries: {gate.entries_read.toLocaleString()}. Consider{" "}
          <code>python -m analysis.prepare --entries 500000</code> on the host.
        </p>
      )}
    </div>
  );
}
