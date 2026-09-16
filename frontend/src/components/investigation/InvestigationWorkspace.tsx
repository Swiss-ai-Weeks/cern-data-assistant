import { useEffect, useRef, useState } from "react";
import EntryInspector from "./EntryInspector";
import Spectrum from "./Spectrum";
import { askAssistant } from "../../api";
import {
  calculateRun,
  DEFAULT_SELECTION,
  getEntries,
  getInvestigationStatus,
  suggestSelection,
  type Entries,
  type Run,
  type Selection,
  type Status,
} from "../../lib/investigationApi";

const STORAGE_KEY = "beamline-dimuon-investigation-v1";

type SavedInvestigation = {
  spec: Selection;
  run: Run | null;
  baseline: Run | null;
  history: Run[];
};

function loadSavedInvestigation(): SavedInvestigation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null") as SavedInvestigation | null;
    if (!value || !Array.isArray(value.history) || (value.run && typeof value.run.id !== "string")) return null;
    return value;
  } catch { return null; }
}

export default function InvestigationWorkspace({ onClose }: { onClose: () => void }) {
  const [saved] = useState(loadSavedInvestigation);
  const [status, setStatus] = useState<Status | null>(null);
  const [spec, setSpec] = useState<Selection>(saved?.spec ?? DEFAULT_SELECTION);
  const [run, setRun] = useState<Run | null>(saved?.run ?? null);
  const [baseline, setBaseline] = useState<Run | null>(saved?.baseline ?? null);
  const [history, setHistory] = useState<Run[]>(saved?.history ?? []);
  const [entries, setEntries] = useState<Entries | null>(null);
  const [bin, setBin] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [message, setMessage] = useState("");
  const [explanation, setExplanation] = useState<Awaited<ReturnType<typeof askAssistant>> | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => { getInvestigationStatus().then(setStatus).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (run) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({spec, run, baseline, history}));
  }, [spec, run, baseline, history]);
  useEffect(() => {
    if (status?.ready && !run && !autoStarted.current) {
      autoStarted.current = true;
      void runSelection(DEFAULT_SELECTION, false);
    }
  }, [status?.ready, run]);

  async function runSelection(next = spec, keepBaseline = true) {
    setBusy(true); setError("");
    try {
      const result = await calculateRun(next);
      if (keepBaseline && run && !baseline && JSON.stringify(run.spec) !== JSON.stringify(next)) setBaseline(run);
      setRun(result); setSpec(result.spec); setEntries(null); setBin(null);
      setHistory(previous => previous.some(item => item.id === result.id) ? previous : [...previous, result].slice(-8));
    } catch (e) { setError(e instanceof Error ? e.message : "The analysis could not run."); }
    finally { setBusy(false); }
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
        const currentIndex = history.findIndex(item => item.id === run?.id);
        const previous = currentIndex > 0 ? history[currentIndex - 1] : null;
        if (previous) {
          setRun(previous); setSpec(previous.spec); setEntries(null); setBin(null);
          setMessage(`Undid the last change. Restored pT ≥ ${previous.spec.min_pt} GeV, |η| ≤ ${previous.spec.max_abs_eta}, ${previous.spec.charge} charge.`);
        } else setMessage("There is no earlier selection to restore.");
      } else if (lower.includes("compare") && lower.includes("original")) {
        setMessage(baseline ? "The reference selection is shown as a dashed line. The current run remains the solid line." : "Run a revised selection first; then I can compare it with the reference run.");
      } else {
        const suggestion = await suggestSelection(query, spec);
        if (suggestion.action === "selection" && suggestion.spec) {
          setSpec(suggestion.spec);
          setMessage(`${suggestion.message} Computing the revised spectrum now.`);
          await runSelection(suggestion.spec);
        } else if (suggestion.action === "evidence") {
          setMessage(suggestion.message);
          setExplanation(await askAssistant("What does the documented feature around 30 GeV in the CMS dimuon spectrum mean?"));
        } else setMessage(suggestion.message);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "I could not interpret that request."); }
    finally { setBusy(false); setCommand(""); }
  }

  return <section className="iv-workspace" aria-label="CMS dimuon investigation">
    <div className="iv-header">
      <div><p className="iv-eyebrow">GUIDED CERN INVESTIGATION</p><h1>Particle signal or selection effect?</h1><p className="iv-lede">Compute a real CMS muon-pair spectrum, change the selection, and inspect the evidence behind the interpretation.</p></div>
      <button type="button" className="iv-close" onClick={onClose}>Back to Beamline</button>
    </div>
    <div className="iv-source-strip">
      <span>CMS · reduced muons · 2012 · 8 TeV</span>
      <span>{status?.ready ? `${status.manifest?.entries_read.toLocaleString()} source entries staged` : status?.message || "Checking prepared sample…"}</span>
      {status?.manifest && <a href={status.manifest.record_url} target="_blank" rel="noreferrer">CERN record {status.manifest.record_id} ↗</a>}
      {status?.manifest && <span>DOI {status.manifest.doi}</span>}
      <span>Evidence mode: calculated + documented</span>
    </div>
    {!status?.ready ? <div className="iv-not-ready"><h2>The real-data sample is not prepared on this server yet.</h2><p>{error || status?.message || "The LaunchPad worker is preparing the bounded CERN sample."}</p><p>This workspace will not invent a plot. Once the verified sample is staged, the same screen becomes runnable.</p></div> : <>
      <section className="iv-conversation" aria-label="Conversational analysis controls">
        <p className="iv-eyebrow">TALK TO THE INVESTIGATION</p>
        <div className="iv-command-row"><input value={command} onChange={e => setCommand(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void interpretCommand(); }} placeholder='“make both muons harder” or “what does this bump mean?”' aria-label="Investigation request" /><button type="button" onClick={() => void interpretCommand()} disabled={!command.trim() || busy}>Apply</button></div>
        {message && <p className="iv-command-message">{message}</p>}
      </section>
      <div className="iv-grid">
        <section className="iv-controls">
          <p className="iv-eyebrow">ACTIVE SELECTION</p>
          <label>Muon pT minimum <span>{spec.min_pt} GeV</span><input type="range" min="0" max="50" step="1" value={spec.min_pt} onChange={e => setSpec({...spec, min_pt: Number(e.target.value)})} /></label>
          <label>Maximum |η| <span>{spec.max_abs_eta}</span><input type="range" min="0.5" max="5" step="0.1" value={spec.max_abs_eta} onChange={e => setSpec({...spec, max_abs_eta: Number(e.target.value)})} /></label>
          <label>Charge pairing <select value={spec.charge} onChange={e => setSpec({...spec, charge: e.target.value as Selection['charge']})}><option value="opposite">Opposite charge</option><option value="same">Same charge</option><option value="any">Any charge</option></select></label>
          <button type="button" className="iv-run" disabled={busy} onClick={() => runSelection()}>{busy ? "Computing…" : run ? "Run revised selection" : "Compute spectrum"}</button>
          {run && <div className="iv-cutflow"><p className="iv-eyebrow">CUT FLOW</p>{run.cutflow.map(step => <div key={step.label}><span>{step.label}</span><strong>{step.count.toLocaleString()}</strong></div>)}</div>}
          {history.length > 0 && <div className="iv-history"><p className="iv-eyebrow">RUN HISTORY</p>{history.map((item, index) => <button type="button" key={item.id} aria-pressed={run?.id === item.id} onClick={() => { setRun(item); setSpec(item.spec); setEntries(null); setBin(null); }}><span>{index === 0 ? "Reference" : `Revision ${index}`}</span><strong>{item.selected_events.toLocaleString()}</strong><small>pT ≥ {item.spec.min_pt} · |η| ≤ {item.spec.max_abs_eta} · {item.spec.charge}</small></button>)}</div>}
          {run && <button type="button" className="iv-export" onClick={() => { window.location.href = `/api/investigations/runs/${run.id}/export`; }}>Export reproducible investigation</button>}
          {baseline && <button type="button" className="iv-compare" onClick={() => setMessage("The dashed line is the original selection; the solid line is the current revision.")}>Compare with original</button>}
        </section>
        <section className="iv-main-panel">
          {!run ? <div className="iv-empty"><p className="iv-eyebrow">{busy ? "COMPUTING FROM CERN DATA" : "READY TO RUN"}</p><h2>{busy ? "Building the reference spectrum…" : "Start with the documented reference selection."}</h2><p>Exactly two muons, opposite charge, and the published kinematic variables. Every number in the plot comes from the staged CERN sample.</p></div> : <><Spectrum run={run} baseline={baseline} selectedBin={bin} onSelect={inspect} />{baseline && run.id !== baseline.id && <div className="iv-delta"><span>Selection impact</span><strong>{(run.selected_events - baseline.selected_events).toLocaleString()} events</strong><small>{((run.selected_events / baseline.selected_events - 1) * 100).toFixed(1)}% versus the original run</small></div>}</>}
        </section>
      </div>
      {entries && <EntryInspector data={entries} />}
      {explanation && <section className="iv-grounded-answer"><div><p className="iv-eyebrow">CERN-GROUNDED EXPLANATION</p><h2>{explanation.grounded ? "What the source says" : "Beamline withheld an unsupported explanation"}</h2><p>{explanation.answer}</p></div><div className="iv-links">{explanation.sources.filter(source => source.used).map(source => <a key={source.n} href={source.source} target="_blank" rel="noreferrer"><span>Source [{source.n}] · {source.score.toFixed(2)} match</span>{source.title} ↗</a>)}</div></section>}
      <section className="iv-evidence"><div><p className="iv-eyebrow">WHY THIS MATTERS</p><h2>A bump is an observation, not a discovery.</h2><p>CERN’s reference analysis discusses a feature around 30 GeV as a trigger effect rather than a particle resonance. Beamline keeps that published explanation separate from what this calculation itself establishes.</p></div><div className="iv-links">{(status?.sources || []).map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><span>{source.kind}</span>{source.title} ↗</a>)}</div></section>
    </>}
  </section>;
}
