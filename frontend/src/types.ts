export interface RecordSummary {
  recid: number | string;
  title: string;
  experiment: string;
  type: string;
  subtype: string;
  collision_energy: string;
  collision_type: string;
  date_published: string;
  file_count: number;
  abstract: string;
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
}
