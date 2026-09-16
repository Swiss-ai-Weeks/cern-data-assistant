import { useState } from "react";
import { recordBeginnerSession, type BeginnerTask } from "../../lib/investigationApi";

type TaskState = { task_id: string; completed: boolean; notes: string };

export default function BeginnerChecklistPanel({
  tasks,
  sessionsRecorded,
}: {
  tasks: BeginnerTask[];
  sessionsRecorded: number;
}) {
  const [tester, setTester] = useState("");
  const [rows, setRows] = useState<TaskState[]>(() =>
    tasks.map((t) => ({ task_id: t.id, completed: false, notes: "" })),
  );
  const [confusion, setConfusion] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!tasks.length) return null;

  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await recordBeginnerSession({
        tester,
        results: rows,
        confusion_notes: confusion,
      });
      setMessage(`Recorded session ${res.entry.id} · ${res.sessions_recorded} total on this host.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save checklist.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="iv-beginner-checklist">
      <summary>
        Beginner checklist ({sessionsRecorded} recorded on server)
      </summary>
      <p className="iv-caption">
        For someone who did not build the UI: five tasks from the product plan. Save results to the investigation data directory on this host.
      </p>
      <label className="iv-beginner-tester">
        Tester name or initials
        <input value={tester} onChange={(e) => setTester(e.target.value)} maxLength={120} />
      </label>
      <ol className="iv-beginner-tasks">
        {tasks.map((task, index) => (
          <li key={task.id}>
            <label>
              <input
                type="checkbox"
                checked={rows[index]?.completed ?? false}
                onChange={(e) => {
                  const next = [...rows];
                  next[index] = { ...next[index], completed: e.target.checked };
                  setRows(next);
                }}
              />
              <span>{task.prompt}</span>
            </label>
            <p className="iv-caption">{task.success_criteria}</p>
            <textarea
              placeholder="Notes"
              value={rows[index]?.notes ?? ""}
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...next[index], notes: e.target.value };
                setRows(next);
              }}
              rows={2}
            />
          </li>
        ))}
      </ol>
      <label className="iv-beginner-confusion">
        Confusion points (optional)
        <textarea value={confusion} onChange={(e) => setConfusion(e.target.value)} rows={3} />
      </label>
      <button type="button" disabled={busy || !tester.trim()} onClick={() => void submit()}>
        {busy ? "Saving…" : "Save checklist session"}
      </button>
      {message && <p className="iv-command-message">{message}</p>}
      {error && <p className="iv-error">{error}</p>}
    </details>
  );
}
