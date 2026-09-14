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
  total_matches: number;
  returned: number;
  model_used: string | null;
  llm_ranked: boolean;
  results: RecordSummary[];
}

export interface HealthResponse {
  cern_api: "ok" | "unreachable";
  ollama: "ok" | "unreachable";
  ollama_model: string;
  ollama_models_installed: string[];
  knowledge_base?: "ready" | "empty";
  knowledge_chunks?: number;
}

export interface AskSource {
  n: number;
  title: string;
  source: string;
  score: number;
  used: boolean;
}

export interface AskResponse {
  question: string;
  answer: string;
  grounded: boolean;
  model_used?: string;
  sources: AskSource[];
}

export type AssistantResponse =
  | (SearchResponse & { mode: "search"; route_confidence: number })
  | (AskResponse & { mode: "ask"; route_confidence: number });
