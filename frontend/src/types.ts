export interface RecordSummary {
  recid: number | string;
  title: string;
  experiment: string;
  type: string;
  kind: string;
  is_dataset: boolean;
  subtype: string;
  collision_energy: string;
  collision_type: string;
  run_period?: string;
  date_published: string;
  file_count: number;
  size_bytes: number | null;
  size: string;
  formats: string[];
  doi: string | null;
  abstract: string;
  usage: string;
  suggestion: string;
  citation: string;
  url: string;
  relevance?: number;
  why?: string;
  constraint_fit?: string;
  files?: RecordFile[];
  license?: string | null;
  picked?: boolean;
}

export interface RecordFile {
  filename: string;
  size: number | null;
  uri: string | null;
}

export interface RecordDetail extends RecordSummary {
  files: RecordFile[];
  license: string | null;
}

export interface SearchResponse {
  query: string;
  search_terms: string;
  /** Exact filters sent to the CERN API (collision_energy, collision_type, experiment, type). */
  facets?: Record<string, string>;
  facets_requested?: Record<string, string>;
  /** CMS primary-dataset aliases merged into the pool ("muons" -> DoubleMuon, SingleMuon). */
  aliases?: string[];
  broadened?: boolean;
  total_matches: number;
  returned: number;
  model_used: string | null;
  llm_ranked: boolean;
  results: RecordSummary[];
  constraints_requested?: Record<string, string | number | null>;
  constraints_executable?: Record<string, string | number | string[]>;
  investigation_binding?: { available: boolean; record_id: number; energy_tev: number; recipe: string };
  constraint_match?: string;
  constraint_notes?: string[];
}

export interface InvestigationHealth {
  sample_prepared: boolean;
  recommended_gunicorn_workers?: number;
}

export interface HealthResponse {
  cern_api: "ok" | "unreachable";
  ollama: "ok" | "unreachable";
  ollama_model: string;
  ollama_models_installed: string[];
  knowledge_base?: "ready" | "empty";
  knowledge_chunks?: number;
  guardrails?: { min_top_score: number; min_cite_score: number };
  cern_cache?: {
    search: { size: number; hits: number; misses: number };
    record: { size: number; hits: number; misses: number };
  };
  investigation?: InvestigationHealth;
}

export interface AskSource {
  n: number;
  title: string;
  section?: string;
  experiment?: string;
  kind?: "doc" | "glossary" | "seed";
  source: string;
  score: number;
  used: boolean;
  snippet?: string;
}

export type GuardrailStatus =
  | "ok"
  | "low_confidence"
  | "refused"
  | "refused_by_model"
  | "no_citations"
  | "unsupported"
  | "blocked";

export interface Guardrail {
  status: GuardrailStatus;
  top_score: number;
  threshold: number;
  citations_removed: number;
  sentences_removed?: number;
  verifier_overridden?: number;
  unsupported?: string[];
  /** glossary-graph expansion (only tried when the gate would refuse) */
  expanded_terms?: string[];
  expansion_tried?: string[];
  expansion?: string;
}

export interface AskResponse {
  question: string;
  answer: string;
  grounded: boolean;
  model_used?: string;
  guardrail?: string;
  guardrail_detail?: Guardrail;
  sources: AskSource[];
  timing_ms?: { retrieve?: number; llm?: number; verify?: number; draft?: number };
  ungrounded_draft?: string | null;
  draft_model?: string | null;
}

export type AssistantResponse =
  | (SearchResponse & { mode: "search"; route_confidence: number })
  | (AskResponse & { mode: "ask"; route_confidence: number });

export interface AgentInvestigationResult {
  ready: boolean;
  message?: string;
  interpretation?: { action: string; message: string; spec?: { min_pt: number; max_abs_eta: number; charge: string } };
  baseline_run_id?: string;
  run?: {
    id: string;
    spec: { min_pt: number; max_abs_eta: number; charge: string };
    selected_events: number;
    plotted_events: number;
    histogram: { edges: number[]; counts: number[] };
  };
  claims?: { id: string; evidence_label: string; label: string; statement: string }[];
  reference_validation?: {
    region_28_33_gev_events?: number;
    reference_feature_visible?: boolean;
    z_peak_bin_gev?: string;
    z_visible?: boolean;
    note?: string;
  };
}

export interface AgentResponse {
  query: string;
  goal: string;
  plan?: {
    search_query: string | null;
    ask_query: string | null;
    retried?: string | null;
    investigation?: boolean;
  };
  tools_used: string[];
  search: SearchResponse | null;
  answer: AskResponse | null;
  investigation?: AgentInvestigationResult;
  picked?: {
    recid: number | string;
    title: string;
    experiment?: string;
    collision_energy?: string;
    size?: string;
    file_count?: number;
    formats?: string[];
    doi?: string | null;
    citation?: string;
    usage?: string;
    url?: string;
    license?: string | null;
    files?: RecordFile[];
  } | null;
  followups?: string[];
}
