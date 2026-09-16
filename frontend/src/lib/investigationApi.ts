export type Selection = { min_pt: number; max_abs_eta: number; charge: 'opposite' | 'same' | 'any' };
export type Source = { id: string; title: string; url: string; kind: string; summary: string };
export type Manifest = { sample_id: string; sample_file: string; sha256: string; title: string; record_id: number; record_url: string; doi: string; experiment: string; energy_tev: number; entries_read: number; source_total_entries: number; source_file: string; sampling: string; quality: string; scope: string; identity: string; prepared_at: string; source_checksum: string };
export type Run = { id: string; spec: Selection; manifest: Manifest; recipe: string; recipe_sha256: string; created_at: string; cached: boolean; compute_ms: number; selected_events: number; plotted_events: number; cutflow: {label: string; count: number}[]; histogram: { edges: number[]; counts: number[]; underflow: number; overflow: number }; sources: Source[] };
export type Entry = { entry: number; mass: number; muons: {pt: number; eta: number; phi: number; mass: number; charge: number}[] };
export type Entries = { bin: number; low: number; high: number; total: number; entries: Entry[]; identity: string; ordering: string };
export type Status = {ready: boolean; manifest?: Manifest; sources: Source[]; message?: string};
export type Suggestion = {action: 'selection' | 'evidence' | 'unsupported'; message: string; spec?: Selection};
const BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:5001' : '');
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}/api/investigations${path}`, body === undefined ? undefined : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The investigation could not be completed.');
  return data;
}
export const getInvestigationStatus = () => api<Status>('/status');
export const calculateRun = (spec: Selection) => api<Run>('/runs', {spec});
export const getRun = (id: string) => api<Run>(`/runs/${encodeURIComponent(id)}`);
export const getEntries = (id: string, bin: number) => api<Entries>(`/runs/${encodeURIComponent(id)}/entries?bin=${bin}`);
export const suggestSelection = (query: string, spec: Selection) => api<Suggestion>('/suggest', {query, spec});
export async function exportRun(id: string) {
  const response = await fetch(`${BASE}/api/investigations/runs/${encodeURIComponent(id)}/export`);
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Export failed.'); }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a'); a.href = url; a.download = `beamline-${id}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const DEFAULT_SELECTION: Selection = {min_pt: 0, max_abs_eta: 5, charge: 'opposite'};
