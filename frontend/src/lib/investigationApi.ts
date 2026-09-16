export type Selection = { min_pt: number; max_abs_eta: number; charge: 'opposite' | 'same' | 'any' };
export type Source = {
  id: string;
  title: string;
  url: string;
  kind: string;
  summary: string;
  verbatim?: boolean;
  sha256?: string;
  fetched_at?: string;
  excerpt?: string;
};
export type Manifest = { sample_id: string; sample_file: string; sha256: string; title: string; record_id: number; record_url: string; doi: string; experiment: string; energy_tev: number; entries_read: number; source_total_entries: number; source_file: string; sampling: string; quality: string; scope: string; identity: string; prepared_at: string; source_checksum: string };
export type Run = { id: string; spec: Selection; manifest: Manifest; recipe: string; recipe_sha256: string; created_at: string; cached: boolean; compute_ms: number; selected_events: number; plotted_events: number; cutflow: {label: string; count: number}[]; histogram: { edges: number[]; counts: number[]; underflow: number; overflow: number }; sources: Source[] };
export type Entry = { entry: number; mass: number; muons: {pt: number; eta: number; phi: number; mass: number; charge: number}[] };
export type Entries = { bin: number; low: number; high: number; total: number; entries: Entry[]; identity: string; ordering: string };
export type Constraints = { experiment: string; energy_tev: number; collision: string; objects: string; format: string; recipe: string; record_id: number; locked: string[] };
export type EvidenceLabel = { id: string; label: string; meaning: string };
export type InvestigationSession = {
  id: string;
  goal: string;
  constraints: Constraints;
  spec: Selection;
  active_run_id: string | null;
  baseline_run_id: string | null;
  run_ids: string[];
  pending_job_id?: string | null;
  updated_at: string | null;
  evidence_labels: EvidenceLabel[];
};
export type VariableDoc = { id: string; label: string; fields: string[]; url: string; summary: string };
export type DayOneGate = {
  passed: boolean;
  message: string;
  reference_feature_visible?: boolean;
  z_visible?: boolean;
  entries_read?: number;
  reference_validation?: ReferenceValidation;
};

export type ReferenceValidation = {
  z_peak_bin_gev: string;
  z_events: number;
  region_28_33_gev_events: number;
  region_peak_bin_events: number;
  region_peak_over_local_baseline: number;
  z_over_neighbor_average: number;
  reference_feature_visible: boolean;
  z_visible: boolean;
  note: string;
};
export type DataAdapter = {
  record_id: string;
  title: string;
  energy_tev: number;
  experiment?: string;
  format?: string;
  status: string;
  quality_note?: string;
  record_url?: string;
};

export type ProductPhase = {
  phase: number;
  name: string;
  feature_freeze_core?: boolean;
  scope_locked?: string[];
  stretch_deferred?: string[];
};

export type BeginnerTask = {
  id: string;
  prompt: string;
  success_criteria: string;
};

export type Status = {
  ready: boolean;
  manifest?: Manifest;
  sources: Source[];
  message?: string;
  constraints?: Constraints;
  evidence_labels?: EvidenceLabel[];
  goal?: string;
  variable_docs?: VariableDoc[];
  reference_validation?: ReferenceValidation;
  day_one_gate?: DayOneGate;
  baseline_run_id?: string;
  adapters?: DataAdapter[];
  product_phase?: ProductPhase;
  eval_cases_frozen?: number;
  beginner_checklist?: BeginnerTask[];
  beginner_sessions_recorded?: number;
};
export type JobStreamEvent =
  | { type: 'status'; step: string; label: string; job_id?: string }
  | { type: 'result'; job_id: string; run: Run; job: AnalysisJob }
  | { type: 'error'; job_id?: string; error: string };
export type Suggestion = {action: 'selection' | 'evidence' | 'unsupported'; message: string; spec?: Selection};
const BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:5001' : '');
const SESSION_KEY = 'beamline-investigation-session-id';
export const AGENT_HANDOFF_KEY = 'beamline-agent-investigation-handoff';

export type AgentHandoff = {
  run: Run;
  baselineRunId?: string | null;
  spec: Selection;
  focusBin?: number | null;
};

export type SessionBrief = {
  session: InvestigationSession;
  runs: Run[];
  active_run: Run | null;
  baseline_run: Run | null;
  comparison: RunComparison | null;
  narrative: RevisionNarrative | null;
  claims: InvestigationClaim[];
  pending_job: AnalysisJob | null;
  status: { sample_ready: boolean; reference_validation?: ReferenceValidation };
};

export function storeAgentHandoff(handoff: AgentHandoff) {
  try {
    sessionStorage.setItem(AGENT_HANDOFF_KEY, JSON.stringify(handoff));
  } catch { /* ignore */ }
}

export function consumeAgentHandoff(): AgentHandoff | null {
  try {
    const raw = sessionStorage.getItem(AGENT_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(AGENT_HANDOFF_KEY);
    return JSON.parse(raw) as AgentHandoff;
  } catch {
    return null;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}/api/investigations${path}`, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The investigation could not be completed.');
  return data;
}

export const getInvestigationStatus = () => api<Status>('/status');

export type ProductSummary = {
  product: string;
  repository: string;
  public_demo_url: string | null;
  feature_freeze_core: boolean;
  eval_cases_frozen: number;
  investigation: {
    sample_ready: boolean;
    day_one_gate_passed?: boolean;
    beginner_sessions_recorded?: number;
  };
};

export const getProductSummary = () => api<ProductSummary>('/product-summary');

export type ProductSummary = {
  product: string;
  repository: string;
  public_demo_url: string | null;
  feature_freeze_core: boolean;
  eval_cases_frozen: number;
  investigation: {
    sample_ready: boolean;
    day_one_gate_passed?: boolean;
    beginner_sessions_recorded?: number;
  };
};

export const getProductSummary = () => api<ProductSummary>('/product-summary');
export const calculateRun = (spec: Selection) => api<Run>('/runs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({spec})});
export type AnalysisJob = { id: string; status: string; spec: Selection; run_id: string | null; error: string | null; run?: Run };
export const submitAnalysisJob = (spec: Selection) => api<AnalysisJob & { run: Run }>('/jobs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({spec})});
export const getAnalysisJob = (id: string) => api<AnalysisJob>(`/jobs/${encodeURIComponent(id)}`);

async function* readJobStream(response: Response): AsyncGenerator<JobStreamEvent> {
  if (!response.ok || !response.body) throw new Error(`Analysis stream failed (${response.status})`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
      if (!line) continue;
      yield JSON.parse(line.slice(6)) as JobStreamEvent;
    }
  }
}

export async function* streamAnalysisJob(spec: Selection): AsyncGenerator<JobStreamEvent> {
  const response = await fetch(`${BASE}/api/investigations/jobs/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ spec }),
  });
  yield* readJobStream(response);
}

export async function* followAnalysisJob(jobId: string): AsyncGenerator<JobStreamEvent> {
  const response = await fetch(`${BASE}/api/investigations/jobs/${encodeURIComponent(jobId)}/stream`, {
    headers: { Accept: 'text/event-stream' },
  });
  yield* readJobStream(response);
}

export type RestoredSession = InvestigationSession & { runs: Run[] };
export const restoreInvestigationSession = (id: string) => api<RestoredSession>(`/sessions/${encodeURIComponent(id)}/restore`);
export const getSessionBrief = (id: string) => api<SessionBrief>(`/sessions/${encodeURIComponent(id)}/brief`);
export const getRun = (id: string) => api<Run>(`/runs/${encodeURIComponent(id)}`);
export type RunComparison = {
  run_id: string;
  baseline_run_id: string;
  spec_current: Selection;
  spec_baseline: Selection;
  selected_events_delta: number;
  plotted_events_delta: number;
  histogram_delta: { low: number; high: number; current: number; baseline: number; delta: number }[];
  cutflow_delta: { label: string; current: number; baseline: number; delta: number }[];
};
export const compareRuns = (runId: string, baselineId: string) =>
  api<RunComparison>(`/runs/${encodeURIComponent(runId)}/compare?baseline=${encodeURIComponent(baselineId)}`);
export type InvestigationClaim = {
  id: string;
  evidence_label: string;
  label: string;
  statement: string;
  excerpt?: string;
  refs?: { kind: string; run_id?: string; field?: string; source_id?: string; url?: string }[];
  resolved_refs?: { kind: string; value?: unknown }[];
};
export type RevisionNarrative = {
  summary: string;
  spec_changes: string[];
  cutflow_delta: string[];
  histogram_shifts: string[];
};
export const getRunClaims = (runId: string, baselineId?: string | null, bin?: number | null) => {
  const params = new URLSearchParams();
  if (baselineId) params.set("baseline", baselineId);
  if (bin != null) params.set("bin", String(bin));
  const q = params.toString();
  return api<{ run_id: string; claims: InvestigationClaim[] }>(
    `/runs/${encodeURIComponent(runId)}/claims${q ? `?${q}` : ""}`,
  );
};
export const getRunNarrative = (runId: string, baselineId: string) =>
  api<RevisionNarrative>(`/runs/${encodeURIComponent(runId)}/narrative?baseline=${encodeURIComponent(baselineId)}`);
export const getEntries = (id: string, bin: number) => api<Entries>(`/runs/${encodeURIComponent(id)}/entries?bin=${bin}`);
export const suggestSelection = (query: string, spec: Selection) => api<Suggestion>('/suggest', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({query, spec})});

export function loadSessionId(): string | null {
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}

export function rememberSessionId(id: string) {
  try { sessionStorage.setItem(SESSION_KEY, id); } catch { /* ignore */ }
}

export async function createInvestigationSession(body: Partial<InvestigationSession> = {}) {
  const session = await api<InvestigationSession>('/sessions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  rememberSessionId(session.id);
  return session;
}

export async function getInvestigationSession(id: string) {
  return api<InvestigationSession>(`/sessions/${encodeURIComponent(id)}`);
}

export async function saveInvestigationSession(id: string, body: Partial<InvestigationSession>) {
  return api<InvestigationSession>(`/sessions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

export async function refreshVerbatimSources() {
  return api<{ refreshed: unknown[]; errors: { id: string; error: string }[]; sources: Source[] }>(
    '/sources/refresh',
    { method: 'POST' },
  );
}

export async function recordBeginnerSession(body: {
  tester: string;
  results: { task_id: string; completed: boolean; notes?: string }[];
  confusion_notes?: string;
}) {
  return api<{ entry: { id: string }; sessions_recorded: number }>('/beginner-checklist/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function exportRun(id: string, baselineId?: string | null) {
  const q = baselineId ? `?baseline=${encodeURIComponent(baselineId)}` : "";
  const response = await fetch(`${BASE}/api/investigations/runs/${encodeURIComponent(id)}/export${q}`);
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Export failed.'); }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a'); a.href = url; a.download = `beamline-${id}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const DEFAULT_SELECTION: Selection = {min_pt: 0, max_abs_eta: 5, charge: 'opposite'};
