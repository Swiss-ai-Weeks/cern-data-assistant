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
  const [exportMsg, setExportMsg] = useState("");
  const autoStarted = useRef(false);
  const sessionBoot = useRef(false);
  const handoffPending = useRef<ReturnType<typeof consumeAgentHandoff>>(null);

  useEffect(() => { getInvestigationStatus().then(setStatus).catch((e) => setError(e.message)); }, []);

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

  async function interpretCommand() {
    const query = command.trim();
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
    <section className="iv-workspace" aria-label="CMS dimuon investigation">
      <div className="iv-header">
        <div>
          <p className="iv-eyebrow">CERN INVESTIGATION</p>
          <h1>Particle signal or selection effect?</h1>
          <p className="iv-lede">{goal ?? "Compute a real CMS muon-pair spectrum, change the selection, and inspect the evidence behind the interpretation."}</p>
        </div>
        <div className="iv-header-actions">
          <div className="iv-service-pill" aria-label="Service status">
            <span className={health?.cern_api === "ok" ? "ok" : "down"}>CERN {health?.cern_api ?? "…"}</span>
            <span className={health?.ollama === "ok" ? "ok" : "down"}>Model {health?.ollama ?? "…"}</span>
            <span className={health?.investigation?.sample_prepared ? "ok" : "down"}>
              Sample {health?.investigation?.sample_prepared ? "staged" : "missing"}
            </span>
            {status?.product_phase?.feature_freeze_core && (
              <span className="ok" title={status.product_phase.scope_locked?.join(" · ")}>
                Phase {status.product_phase.phase} · core frozen
              </span>
            )}
            {status?.eval_cases_frozen != null && status.eval_cases_frozen > 0 && (
              <span>Eval {status.eval_cases_frozen} frozen</span>
            )}
          </div>
          {session?.id && (
            <span className="iv-session-pill" title={`Investigation session ${session.id}`}>
              Saved · {session.id.slice(0, 8)}
            </span>
          )}
          {run && (
            <button
              type="button"
              className="iv-export iv-export-header"
              onClick={() => {
                setExportMsg("");
                void exportRun(run.id, baseline?.id)
                  .then(() => setExportMsg("Export ZIP downloaded (recipe, sample checksums, claims, notebook)."))
                  .catch((e) => setError(e instanceof Error ? e.message : "Export failed."));
              }}
            >
              Export investigation
            </button>
          )}
          <button type="button" className="iv-close" onClick={onOpenFindData}>Find data or ask docs →</button>
          {exportMsg && <p className="iv-export-msg" role="status">{exportMsg}</p>}
        </div>
      </div>
      {constraints && (
        <div className="iv-constraints" aria-label="Dataset constraints">
          <p className="iv-eyebrow">ACTIVE CONSTRAINTS</p>
          <div className="iv-constraint-tags">
            <span>{constraints.experiment}</span>
            <span>{constraints.energy_tev} TeV</span>
            <span>{constraints.collision}</span>
            <span>{constraints.objects}</span>
            <span>{constraints.format}</span>
            <span>record {constraints.record_id}</span>
          </div>
          <p className="iv-caption">Locked for this analysis. Use Find data to search other energies or formats; the sample will not change silently.</p>
        </div>
      )}
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
        <span>{status?.ready ? `${status.manifest?.entries_read.toLocaleString()} source entries staged` : status?.message || "Checking prepared sample…"}</span>
        {status?.manifest && <a href={status.manifest.record_url} target="_blank" rel="noreferrer">CERN record {status.manifest.record_id} ↗</a>}
        {status?.manifest && <span>DOI {status.manifest.doi}</span>}
      {session?.id && <span>Session {session.id.slice(0, 8)}</span>}
      {status?.reference_validation && (
        <span title={status.reference_validation.note}>
          Reference check · Z {status.reference_validation.z_events.toLocaleString()} · 28–33 GeV {status.reference_validation.region_28_33_gev_events.toLocaleString()}
          {status.reference_validation.reference_feature_visible ? " · feature above local baseline" : " · feature not confirmed on this sample"}
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
          Refresh CERN passages
        </button>
      )}
      {sourceRefreshMsg && <span>{sourceRefreshMsg}</span>}
    </div>
    {busy && jobLabel && <p className="iv-job-status" role="status">{jobLabel}</p>}
      {!status?.ready ? (
        <div className="iv-not-ready">
          <h2>The real-data sample is not prepared on this server yet.</h2>
          <p>{error || status?.message || "Prepare the bounded CERN sample on the host."}</p>
          <p>This workspace will not invent a plot. Once the verified sample is staged, the spectrum runs here.</p>
        </div>
      ) : (
        <>
          <section className="iv-conversation" aria-label="Conversational analysis controls">
            <p className="iv-eyebrow">CHANGE THE ANALYSIS</p>
            <div className="iv-command-row">
              <input value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void interpretCommand(); }} placeholder="Require both muons above 10 GeV, or ask what a peak means" aria-label="Investigation request" />
              <button type="button" onClick={() => void interpretCommand()} disabled={!command.trim() || busy}>Apply</button>
            </div>
            {message && <p className="iv-command-message">{message}</p>}
          </section>
          <div className="iv-product-layout">
            <section className="iv-controls">
              <p className="iv-eyebrow">ACTIVE SELECTION</p>
              <p className="iv-caption">Sliders change the recipe locally. Run recomputes the histogram without calling the language model.</p>
              <label>Muon pT minimum <span>{spec.min_pt} GeV</span><input type="range" min="0" max="50" step="1" value={spec.min_pt} onChange={(e) => setSpec({ ...spec, min_pt: Number(e.target.value) })} /></label>
              <label>Maximum |η| <span>{spec.max_abs_eta}</span><input type="range" min="0.5" max="5" step="0.1" value={spec.max_abs_eta} onChange={(e) => setSpec({ ...spec, max_abs_eta: Number(e.target.value) })} /></label>
              <label>Charge pairing
                <select value={spec.charge} onChange={(e) => setSpec({ ...spec, charge: e.target.value as Selection["charge"] })}>
                  <option value="opposite">Opposite charge</option>
                  <option value="same">Same charge</option>
                  <option value="any">Any charge</option>
                </select>
              </label>
              <button type="button" className="iv-run" disabled={busy} onClick={() => runSelection()}>{busy ? "Computing…" : run ? "Run revised selection" : "Compute spectrum"}</button>
              {run && (
                <div className="iv-cutflow">
                  <p className="iv-eyebrow">CUT FLOW</p>
                  {run.cutflow.map((step) => <div key={step.label}><span>{step.label}</span><strong>{step.count.toLocaleString()}</strong></div>)}
                </div>
              )}
              {history.length > 0 && (
                <div className="iv-history">
                  <p className="iv-eyebrow">RUN HISTORY</p>
                  {history.map((item, index) => (
                    <button type="button" key={item.id} aria-pressed={run?.id === item.id} onClick={() => { setRun(item); setSpec(item.spec); setEntries(null); setBin(null); }}>
                      <span>{index === 0 ? "Reference" : `Revision ${index}`}</span>
                      <strong>{item.selected_events.toLocaleString()}</strong>
                      <small>pT ≥ {item.spec.min_pt} · |η| ≤ {item.spec.max_abs_eta} · {item.spec.charge}</small>
                    </button>
                  ))}
                </div>
              )}
              {baseline && <button type="button" className="iv-compare" onClick={() => setMessage("The dashed line is the original selection; the solid line is the current revision.")}>Compare with original</button>}
              {run && (
                <button type="button" className="iv-region-btn" onClick={() => void inspect(30)}>
                  Inspect documented 30 GeV region
                </button>
              )}
            </section>
            <section className="iv-main-panel">
              {!run ? (
                <div className="iv-empty">
                  <p className="iv-eyebrow">{busy ? "COMPUTING FROM CERN DATA" : "READY TO RUN"}</p>
                  <h2>{busy ? "Building the reference spectrum…" : "Start with the documented reference selection."}</h2>
                  <p>Exactly two muons, opposite charge, and the published kinematic variables. Every number in the plot comes from the staged CERN sample.</p>
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
                      <p className="iv-eyebrow">REVISION LOG</p>
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
                </>
              )}
            </section>
            <aside className="iv-evidence-panel" aria-label="Evidence and documentation">
              {run && <InvestigationProvenance run={run} />}
              {run && (
                <section className="iv-calculated-card">
                  <p className="iv-eyebrow">CALCULATED FROM THIS SAMPLE</p>
                  <p><strong>{run.selected_events.toLocaleString()}</strong> selected events · <strong>{run.plotted_events.toLocaleString()}</strong> plotted 0–120 GeV</p>
                  <p className="iv-caption">Counts come from the staged sample and validated recipe, not from the language model.</p>
                </section>
              )}
              {claimList.length > 0 && <InvestigationClaims claims={claimList} />}
              {evidenceLabels.length > 0 && (
                <section className="iv-evidence-model" aria-label="Evidence labels">
                  <p className="iv-eyebrow">EVIDENCE MODEL</p>
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
              {explaining && <p className="iv-caption">Loading CERN-grounded explanation…</p>}
              {explanation && (
                <section className="iv-grounded-answer">
                  <div>
                    <p className="iv-eyebrow">DOCUMENTED BY CERN/CMS</p>
                    <h2>{explanation.grounded ? "What the source says" : "Beamline withheld an unsupported explanation"}</h2>
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
                  <p className="iv-eyebrow">INTERPRETATION (WITH LIMITS)</p>
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
            </aside>
          </div>
          {entries && <EntryInspector data={entries} variableDocs={status?.variable_docs ?? []} />}
        </>
      )}
    </section>
  );
}
