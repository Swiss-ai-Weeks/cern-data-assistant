import { useEffect, useRef, useState } from "react";
import EntryInspector from "./EntryInspector";
import InvestigationClaims from "./InvestigationClaims";
import InvestigationProvenance from "./InvestigationProvenance";
import AdapterCapabilityBand from "./AdapterCapabilityBand";
import BeginnerChecklistPanel from "./BeginnerChecklistPanel";
import DayOneGateBanner from "./DayOneGateBanner";
import Spectrum from "./Spectrum";
import { askAssistant } from "../../api";
import type { HealthResponse } from "../../types";
import {
  followAnalysisJob,
  getSessionBrief,
  streamAnalysisJob,
  createInvestigationSession,
  DEFAULT_SELECTION,
  compareRuns,
  exportRun,
  getEntries,
  getRun,
  getInvestigationStatus,
  getRunClaims,
  getRunNarrative,
  consumeAgentHandoff,
  loadSessionId,
  saveInvestigationSession,
  suggestSelection,
  refreshVerbatimSources,
  type EvidenceLabel,
  type InvestigationSession,
  type Run,
  type Selection,
  type InvestigationClaim,
  type RevisionNarrative,
  type RunComparison,
  type Status,
} from "../../lib/investigationApi";

type SavedInvestigation = {
  spec: Selection;
  run: Run | null;
  baseline: Run | null;
  history: Run[];
};

function loadLocalFallback(): SavedInvestigation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem("beamline-dimuon-investigation-v1") || "null") as SavedInvestigation | null;
    if (!value || !Array.isArray(value.history) || (value.run && typeof value.run.id !== "string")) return null;
    return value;
  } catch { return null; }
}

export default function InvestigationWorkspace({
  health,
  onOpenFindData,
}: {
  health: HealthResponse | null;
  onOpenFindData: () => void;
}) {
  const [saved] = useState(loadLocalFallback);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [session, setSession] = useState<InvestigationSession | null>(null);
  const [spec, setSpec] = useState<Selection>(saved?.spec ?? DEFAULT_SELECTION);
  const [run, setRun] = useState<Run | null>(saved?.run ?? null);
  const [baseline, setBaseline] = useState<Run | null>(saved?.baseline ?? null);
  const [history, setHistory] = useState<Run[]>(saved?.history ?? []);
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof getEntries>> | null>(null);
  const [bin, setBin] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [message, setMessage] = useState("");
  const [explanation, setExplanation] = useState<Awaited<ReturnType<typeof askAssistant>> | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [jobLabel, setJobLabel] = useState("");
  const [comparison, setComparison] = useState<RunComparison | null>(null);
  const [claimList, setClaimList] = useState<InvestigationClaim[]>([]);
  const [revisionStory, setRevisionStory] = useState<RevisionNarrative | null>(null);
  const [sourceRefreshMsg, setSourceRefreshMsg] = useState("");
  const [evidenceTab, setEvidenceTab] = useState<"result" | "claims" | "sources">("result");
  const [exportMsg, setExportMsg] = useState("");
  const autoStarted = useRef(false);
  const sessionBoot = useRef(false);
  const handoffPending = useRef<ReturnType<typeof consumeAgentHandoff>>(null);

  useEffect(() => {
    getInvestigationStatus()
      .then(setStatus)
      .catch((e) => setError(e.message))
      .finally(() => setStatusLoading(false));
  }, []);

  useEffect(() => {
    handoffPending.current = consumeAgentHandoff();
  }, []);

  function applyHandoff(handoff: NonNullable<ReturnType<typeof consumeAgentHandoff>>) {
    setRun(handoff.run);
    setSpec(handoff.spec);
    setHistory((prev) => prev.some((r) => r.id === handoff.run.id) ? prev : [...prev, handoff.run]);
    autoStarted.current = true;
    if (handoff.baselineRunId) void getRun(handoff.baselineRunId).then(setBaseline).catch(() => { /* optional */ });
    if (handoff.focusBin != null) void inspect(handoff.focusBin);
  }

  useEffect(() => {
    if (sessionBoot.current || !status?.ready) return;
    sessionBoot.current = true;
    void (async () => {
      try {
        const existingId = loadSessionId();
        if (existingId) {
          const brief = await getSessionBrief(existingId);
          setSession(brief.session);
          setSpec(brief.session.spec);
          if (brief.runs.length > 0) setHistory(brief.runs);
          if (brief.active_run) setRun(brief.active_run);
          if (brief.baseline_run) setBaseline(brief.baseline_run);
          if (brief.claims.length) setClaimList(brief.claims);
          if (brief.narrative) setRevisionStory(brief.narrative);
          if (brief.comparison) setComparison(brief.comparison);
          if (brief.session.pending_job_id) {
            autoStarted.current = true;
            void resumeJob(brief.session.pending_job_id, brief.session.spec);
          } else {
            autoStarted.current = Boolean(brief.active_run);
          }
          if (handoffPending.current?.run) {
            const h = handoffPending.current;
            handoffPending.current = null;
            applyHandoff(h);
            void saveInvestigationSession(brief.session.id, {
              active_run_id: h.run.id,
              baseline_run_id: h.baselineRunId ?? brief.baseline_run?.id ?? null,
              run_ids: [...new Set([...brief.runs.map((r) => r.id), h.run.id])],
              spec: h.run.spec,
            }).then(setSession).catch(() => { /* local ok */ });
          }
          return;
        }
        const created = await createInvestigationSession({ spec: saved?.spec ?? DEFAULT_SELECTION });
        setSession(created);
        if (handoffPending.current?.run) {
          applyHandoff(handoffPending.current);
          const h = handoffPending.current;
          handoffPending.current = null;
          void saveInvestigationSession(created.id, {
            active_run_id: h.run.id,
            baseline_run_id: h.baselineRunId ?? null,
            run_ids: [h.run.id],
            spec: h.run.spec,
          }).then(setSession);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the investigation session.");
      }
    })();
  }, [status?.ready, saved?.spec]);

  useEffect(() => {
    if (run) {
      sessionStorage.setItem("beamline-dimuon-investigation-v1", JSON.stringify({ spec, run, baseline, history }));
    }
  }, [spec, run, baseline, history]);

  useEffect(() => {
    if (!session?.id || !run) return;
    const runIds = history.map((item) => item.id);
    void saveInvestigationSession(session.id, {
      spec: run.spec,
      active_run_id: run.id,
      baseline_run_id: baseline?.id ?? null,
      run_ids: runIds,
      goal: session.goal,
      constraints: session.constraints,
    }).then(setSession).catch(() => { /* keep local state */ });
  }, [session?.id, run?.id, baseline?.id, history.length]);

  useEffect(() => {
    if (status?.baseline_run_id && !baseline && history.length === 0) {
      void getRun(status.baseline_run_id).then(setBaseline).catch(() => { /* optional */ });
    }
  }, [status?.baseline_run_id, baseline, history.length]);

  useEffect(() => {
    if (!run?.id) {
      setComparison(null);
      setRevisionStory(null);
      setClaimList([]);
      return;
    }
    if (!baseline?.id || run.id === baseline.id) {
      setComparison(null);
      setRevisionStory(null);
      void getRunClaims(run.id, null, bin).then((r) => setClaimList(r.claims)).catch(() => setClaimList([]));
      return;
    }
    void compareRuns(run.id, baseline.id).then(setComparison).catch(() => setComparison(null));
    void getRunNarrative(run.id, baseline.id).then(setRevisionStory).catch(() => setRevisionStory(null));
    void getRunClaims(run.id, baseline.id, bin).then((r) => setClaimList(r.claims)).catch(() => setClaimList([]));
  }, [run?.id, baseline?.id, bin]);

  useEffect(() => {
    if (status?.ready && !run && !autoStarted.current) {
      autoStarted.current = true;
      void runSelection(DEFAULT_SELECTION, false);
    }
  }, [status?.ready, run]);

  async function persistPendingJob(jobId: string | null, nextSpec = spec) {
    if (!session?.id) return;
    try {
      const updated = await saveInvestigationSession(session.id, { pending_job_id: jobId, spec: nextSpec });
      setSession(updated);
    } catch { /* keep local state */ }
  }

  async function consumeJobStream(
    events: AsyncGenerator<{ type: string; label?: string; error?: string; run?: Run; job_id?: string }>,
    next: Selection,
    keepBaseline: boolean,
  ) {
    let result: Run | null = null;
    let pendingJobId: string | null = null;
    for await (const event of events) {
      if (event.type === "status") {
        setJobLabel(event.label ?? "Computing…");
        if (event.job_id) {
          pendingJobId = event.job_id;
          void persistPendingJob(event.job_id, next);
        }
      }
      if (event.type === "error") throw new Error(event.error ?? "Analysis failed.");
      if (event.type === "result" && event.run) result = event.run;
    }
    if (!result) throw new Error("The analysis did not return a result.");
    await persistPendingJob(null, result.spec);
    if (keepBaseline && run && !baseline && JSON.stringify(run.spec) !== JSON.stringify(next)) setBaseline(run);
    setRun(result); setSpec(result.spec); setEntries(null); setBin(null);
    setHistory((previous) => previous.some((item) => item.id === result!.id) ? previous : [...previous, result!].slice(-8));
    return pendingJobId;
  }

  async function runSelection(next = spec, keepBaseline = true) {
    setBusy(true); setError(""); setJobLabel("Starting analysis…");
    try {
      await consumeJobStream(streamAnalysisJob(next), next, keepBaseline);
    } catch (e) { setError(e instanceof Error ? e.message : "The analysis could not run."); }
    finally { setBusy(false); setJobLabel(""); }
  }

  async function resumeJob(jobId: string, next = spec) {
    setBusy(true); setError(""); setJobLabel("Reconnecting to analysis…");
    try {
      await consumeJobStream(followAnalysisJob(jobId), next, true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reconnect to the analysis job."); }
    finally { setBusy(false); setJobLabel(""); }
  }

  async function inspect(nextBin: number) {
    setBin(nextBin); setError("");
    if (!run) return;
    try { setEntries(await getEntries(run.id, nextBin)); }
    catch (e) { setError(e instanceof Error ? e.message : "Entries could not be loaded."); }
  }

  async function interpretCommand(raw?: string) {
    const query = (raw ?? command).trim();
    if (!query || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const lower = query.toLowerCase();
      if (/\b(undo|go back|previous selection)\b/.test(lower)) {
        const currentIndex = history.findIndex((item) => item.id === run?.id);
        const previous = currentIndex > 0 ? history[currentIndex - 1] : null;
        if (previous) {
          setRun(previous); setSpec(previous.spec); setEntries(null); setBin(null);
          setMessage(`Undid the last change. Restored pT ≥ ${previous.spec.min_pt} GeV, |η| ≤ ${previous.spec.max_abs_eta}, ${previous.spec.charge} charge.`);
        } else setMessage("There is no earlier selection to restore.");
      } else if (lower.includes("compare") && lower.includes("original")) {
        setMessage(baseline ? "The reference selection is shown as a dashed line. The current run remains the solid line." : "Run a revised selection first; then compare it with the reference run.");
      } else {
        const suggestion = await suggestSelection(query, spec);
        if (suggestion.action === "selection" && suggestion.spec) {
          setSpec(suggestion.spec);
          setMessage(`${suggestion.message} Computing the revised spectrum now.`);
          await runSelection(suggestion.spec);
        } else if (suggestion.action === "evidence") {
          setMessage(suggestion.message);
          setEvidenceTab("sources");
          setExplaining(true);
          void askAssistant("What does the documented feature around 30 GeV in the CMS dimuon spectrum mean?")
            .then(setExplanation)
            .catch((e) => setError(e instanceof Error ? e.message : "Explanation could not be loaded."))
            .finally(() => setExplaining(false));
        } else setMessage(suggestion.message);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "I could not interpret that request."); }
    finally { setBusy(false); setCommand(""); }
  }

  const constraints = session?.constraints ?? status?.constraints;
  const evidenceLabels: EvidenceLabel[] = session?.evidence_labels ?? status?.evidence_labels ?? [];
  const goal = session?.goal ?? status?.goal;

  return (
    <section className="lab iv-workspace" aria-label="CMS dimuon investigation">
      <header className="lab-head iv-lab-toolbar">
        <div className="iv-lab-title">
          <p className="lab-kicker">Investigation 01 <span aria-hidden>/</span> CMS dimuon spectrum</p>
          <h1>Is the 30 GeV feature physics—or the selection?</h1>
          <p className="lab-lede">{goal ?? "Revise a real analysis and keep every calculation, interpretation, and source in its proper place."}</p>
        </div>
        <div className="lab-head-actions iv-lab-actions">
          {health && !health.investigation?.sample_prepared && (
            <span className="iv-gate-chip warn">Sample not staged</span>
          )}
          {status?.day_one_gate && !status.day_one_gate.passed && (
            <span className="iv-gate-chip warn">Sample needs review</span>
          )}
          {run && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setExportMsg("");
                void exportRun(run.id, baseline?.id)
                  .then(() => setExportMsg("Export downloaded — recipe, checksums, claims, and notebook."))
                  .catch((e) => setError(e instanceof Error ? e.message : "Export failed."));
              }}
            >
              Export reproducible package
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onOpenFindData}>
            Explore other data
          </button>
        </div>
      </header>
      {exportMsg && <p className="iv-export-msg" role="status">{exportMsg}</p>}
      {error && <p className="iv-error" role="alert">{error}</p>}

      {constraints && (
        <div className="iv-constraint-row" aria-label="Locked dataset constraints">
          <span><small>Experiment</small>{constraints.experiment}</span>
          <span><small>Energy</small>{constraints.energy_tev} TeV</span>
          <span><small>Collision</small>{constraints.collision}</span>
          <span><small>Objects</small>{constraints.objects}</span>
          <span><small>Dataset</small>record {constraints.record_id}</span>
        </div>
      )}

      <details className="iv-lab-notes">
        <summary>
          Sample &amp; coverage
          {status?.ready && status.manifest ? ` · ${status.manifest.entries_read.toLocaleString()} events` : ""}
        </summary>
        {status?.day_one_gate && <DayOneGateBanner gate={status.day_one_gate} />}
        {status?.adapters && <AdapterCapabilityBand adapters={status.adapters} />}
        {status?.beginner_checklist && status.beginner_checklist.length > 0 && (
          <BeginnerChecklistPanel
            tasks={status.beginner_checklist}
            sessionsRecorded={status.beginner_sessions_recorded ?? 0}
          />
        )}
        <div className="iv-source-strip">
          <span>CMS · reduced muons · 2012 · 8 TeV</span>
          {status?.manifest && (
            <a href={status.manifest.record_url} target="_blank" rel="noreferrer">
              Record {status.manifest.record_id} ↗
            </a>
          )}
          {status?.manifest && <span>DOI {status.manifest.doi}</span>}
          {status?.reference_validation && (
            <span title={status.reference_validation.note}>
              Z {status.reference_validation.z_events.toLocaleString()} · 28–33 GeV {status.reference_validation.region_28_33_gev_events.toLocaleString()}
            </span>
          )}
          {status?.ready && (
            <button
              type="button"
              className="iv-source-refresh"
              onClick={() => {
                setSourceRefreshMsg("");
                void refreshVerbatimSources()
                  .then((r) => {
                    setStatus((prev) => (prev ? { ...prev, sources: r.sources } : prev));
                    setSourceRefreshMsg(
                      r.errors.length
                        ? `Refreshed ${r.refreshed.length}; ${r.errors.length} failed.`
                        : `Refreshed ${r.refreshed.length} CERN passages.`,
                    );
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : "Source refresh failed."));
              }}
            >
              Refresh passages
            </button>
          )}
          {sourceRefreshMsg && <span>{sourceRefreshMsg}</span>}
        </div>
      </details>

      {busy && jobLabel && <p className="iv-job-status" role="status">{jobLabel}</p>}

      {statusLoading ? (
        <div className="iv-not-ready" aria-busy="true" aria-live="polite">
          <p className="iv-eyebrow">Checking sample</p>
          <h2>Loading the verified investigation state…</h2>
          <p>Reading the staged sample manifest, saved run, and provenance before showing a result.</p>
        </div>
      ) : !status?.ready ? (
        <div className="iv-not-ready">
          <p className="iv-eyebrow">Not ready</p>
          <h2>The real-data sample is not on this server yet.</h2>
          <p>{status?.message || "This lab will not invent a plot. Once the verified CMS sample is staged, the spectrum runs here."}</p>
          <button type="button" className="btn-ghost" onClick={onOpenFindData}>
            Search the catalog instead
          </button>
        </div>
      ) : (
        <>
          <section className="iv-directive" aria-labelledby="directive-title">
            <div className="iv-directive-heading">
              <p className="iv-eyebrow" id="directive-title">Direct the investigation</p>
              <p>Change the selection, compare a revision, or ask for the documented explanation.</p>
            </div>
            <div className="iv-command-row">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void interpretCommand(); }}
                placeholder="Tell Beamline what to change or explain…"
                aria-label="Change or question this investigation"
              />
              <button type="button" onClick={() => void interpretCommand()} disabled={!command.trim() || busy}>
                {busy ? "Working…" : "Apply"}
              </button>
            </div>
            <div className="iv-command-examples" aria-label="Example investigation commands">
              {[
                "Make both muons harder",
                "Compare with the original",
                "What does this bump mean?",
              ].map((text) => (
                <button key={text} type="button" disabled={busy} onClick={() => void interpretCommand(text)}>{text}</button>
              ))}
            </div>
            {message && <p className="iv-command-message" role="status">{message}</p>}
          </section>

          <div className="lab-grid iv-product-layout">
            <section className="lab-rail iv-controls" aria-label="Selection and run history">
              <div className="iv-panel-heading">
                <p className="iv-eyebrow">Selection protocol</p>
                <span>Deterministic controls</span>
              </div>
              <label>Muon pT minimum <span>{spec.min_pt} GeV</span><input type="range" min="0" max="50" step="1" value={spec.min_pt} onChange={(e) => setSpec({ ...spec, min_pt: Number(e.target.value) })} /></label>
              <label>Maximum |η| <span>{spec.max_abs_eta}</span><input type="range" min="0.5" max="5" step="0.1" value={spec.max_abs_eta} onChange={(e) => setSpec({ ...spec, max_abs_eta: Number(e.target.value) })} /></label>
              <label>Charge pairing
                <select value={spec.charge} onChange={(e) => setSpec({ ...spec, charge: e.target.value as Selection["charge"] })}>
                  <option value="opposite">Opposite charge</option>
                  <option value="same">Same charge</option>
                  <option value="any">Any charge</option>
                </select>
              </label>
              <button type="button" className="iv-run" disabled={busy} onClick={() => runSelection()}>{busy ? "Computing…" : run ? "Recompute selection" : "Compute spectrum"}</button>
              <p className="iv-caption iv-local-note">These controls execute the validated analysis code directly.</p>
              {run && (
                <div className="iv-cutflow">
                  <p className="iv-eyebrow">Cut flow</p>
                  {run.cutflow.map((step) => <div key={step.label}><span>{step.label}</span><strong>{step.count.toLocaleString()}</strong></div>)}
                </div>
              )}
              {history.length > 0 && (
                <div className="iv-history">
                  <p className="iv-eyebrow">Runs</p>
                  {history.map((item, index) => (
                    <button type="button" key={item.id} aria-pressed={run?.id === item.id} onClick={() => { setRun(item); setSpec(item.spec); setEntries(null); setBin(null); }}>
                      <span>{index === 0 ? "Reference" : `Revision ${index}`}</span>
                      <strong>{item.selected_events.toLocaleString()}</strong>
                      <small>pT ≥ {item.spec.min_pt} · |η| ≤ {item.spec.max_abs_eta} · {item.spec.charge}</small>
                    </button>
                  ))}
                </div>
              )}
              {run && (
                <button type="button" className="iv-region-btn" onClick={() => void inspect(30)}>
                  Inspect 30 GeV region
                </button>
              )}
            </section>

            <section className="lab-stage iv-main-panel" aria-label="Computed spectrum">
              <div className="iv-panel-heading iv-stage-heading">
                <div>
                  <p className="iv-eyebrow">Computed result</p>
                  <h2>Muon-pair invariant mass</h2>
                </div>
                {run && <span className="iv-run-id">run {run.id.slice(0, 8)}</span>}
              </div>
              {!run ? (
                <div className="iv-empty">
                  <p className="iv-eyebrow">{busy ? "Computing from CERN data" : "Ready"}</p>
                  <h2>{busy ? "Building the reference spectrum…" : "The plot will appear here."}</h2>
                  <p>Exactly two muons, opposite charge, published kinematics. Every number comes from the staged sample.</p>
                </div>
              ) : (
                <>
                  <Spectrum
                    run={run}
                    baseline={baseline}
                    selectedBin={bin}
                    onSelect={inspect}
                    referenceValidation={status?.reference_validation}
                    histogramDelta={comparison?.histogram_delta}
                  />
                  {revisionStory && (
                    <div className="iv-revision-narrative" role="status">
                      <p className="iv-eyebrow">Revision</p>
                      <p>{revisionStory.summary}</p>
                      {revisionStory.histogram_shifts.length > 0 && (
                        <ul>{revisionStory.histogram_shifts.map((line) => <li key={line}>{line}</li>)}</ul>
                      )}
                    </div>
                  )}
                  {baseline && run.id !== baseline.id && (
                    <div className="iv-delta">
                      <span>Selection impact</span>
                      <strong>{(comparison?.selected_events_delta ?? run.selected_events - baseline.selected_events).toLocaleString()} events</strong>
                      <small>{((run.selected_events / baseline.selected_events - 1) * 100).toFixed(1)}% versus the original run</small>
                      {comparison && (() => {
                        const peak = comparison.histogram_delta.reduce(
                          (best, bin) => (Math.abs(bin.delta) > Math.abs(best.delta) ? bin : best),
                          comparison.histogram_delta[0],
                        );
                        return peak && peak.delta !== 0 ? (
                          <small>Largest bin shift {peak.low}–{peak.high} GeV: {peak.delta > 0 ? "+" : ""}{peak.delta.toLocaleString()} events</small>
                        ) : null;
                      })()}
                    </div>
                  )}
                  {entries && <EntryInspector data={entries} variableDocs={status?.variable_docs ?? []} />}
                </>
              )}
            </section>

            <aside className="lab-evidence iv-evidence-panel" aria-label="Evidence and documentation">
              <div className="iv-panel-heading">
                <p className="iv-eyebrow">Evidence ledger</p>
                <span>Calculation → claim → source</span>
              </div>
              <div className="iv-evidence-tabs" role="tablist" aria-label="Evidence views">
                {([
                  ["result", "Counts"],
                  ["claims", "Claims"],
                  ["sources", "Sources"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`iv-evidence-tab-${id}`}
                    aria-controls={`iv-evidence-panel-${id}`}
                    aria-selected={evidenceTab === id}
                    className={evidenceTab === id ? "is-active" : ""}
                    onClick={() => setEvidenceTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {evidenceTab === "result" && (
                <div className="iv-tab-panel" id="iv-evidence-panel-result" role="tabpanel" aria-labelledby="iv-evidence-tab-result">
                  {run ? (
                    <>
                      <section className="iv-calculated-card">
                        <p className="iv-eyebrow">Calculated from this sample</p>
                        <p><strong>{run.selected_events.toLocaleString()}</strong> selected · <strong>{run.plotted_events.toLocaleString()}</strong> in 0–120 GeV</p>
                        <p className="iv-caption">Counts come from the staged sample and validated recipe, not from the language model.</p>
                      </section>
                      <InvestigationProvenance run={run} />
                    </>
                  ) : (
                    <p className="iv-caption">Run the reference selection to see counts and provenance.</p>
                  )}
                </div>
              )}

              {evidenceTab === "claims" && (
                <div className="iv-tab-panel" id="iv-evidence-panel-claims" role="tabpanel" aria-labelledby="iv-evidence-tab-claims">
                  {claimList.length > 0 ? <InvestigationClaims claims={claimList} /> : <p className="iv-caption">Claims appear after a computed run.</p>}
                  {evidenceLabels.length > 0 && (
                    <section className="iv-evidence-model" aria-label="Evidence labels">
                      <p className="iv-eyebrow">How to read labels</p>
                      <div className="iv-evidence-grid">
                        {evidenceLabels.map((item) => (
                          <article key={item.id}>
                            <strong>{item.label}</strong>
                            <p>{item.meaning}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {evidenceTab === "sources" && (
                <div className="iv-tab-panel" id="iv-evidence-panel-sources" role="tabpanel" aria-labelledby="iv-evidence-tab-sources">
                  {explaining && <p className="iv-caption">Loading CERN-grounded explanation…</p>}
                  {explanation && (
                    <section className="iv-grounded-answer">
                      <div>
                        <p className="iv-eyebrow">Documented by CERN/CMS</p>
                        <h2>{explanation.grounded ? "What the source says" : "Unsupported explanation withheld"}</h2>
                        <p>{explanation.answer}</p>
                      </div>
                      <div className="iv-links">
                        {explanation.sources.filter((source) => source.used).map((source) => (
                          <a key={source.n} href={source.source} target="_blank" rel="noreferrer">
                            <span>Source [{source.n}] · {source.score.toFixed(2)} match</span>
                            {source.title} ↗
                          </a>
                        ))}
                      </div>
                    </section>
                  )}
                  <section className="iv-evidence">
                    <div>
                      <p className="iv-eyebrow">Interpretation</p>
                      <h2>A bump is an observation, not a discovery.</h2>
                      <p>CERN’s reference analysis discusses a feature around 30 GeV as a trigger effect rather than a particle resonance. Beamline keeps that published explanation separate from what this calculation itself establishes.</p>
                    </div>
                    <div className="iv-links">
                      {(status?.sources || []).map((source) => (
                        source.verbatim ? (
                          <details key={source.id} className="iv-source-verbatim">
                            <summary>
                              <span>{source.kind} · sha256 {source.sha256?.slice(0, 12)}…</span>
                              {source.title}
                            </summary>
                            <p>{source.excerpt || source.summary}</p>
                            <a href={source.url} target="_blank" rel="noreferrer">Open CERN record ↗</a>
                          </details>
                        ) : (
                          <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                            <span>{source.kind}</span>
                            {source.title} ↗
                          </a>
                        )
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
