import type {
  AgentResponse,
  AskResponse,
  AssistantResponse,
  HealthResponse,
  RecordDetail,
  SearchResponse,
} from "./types";

// Dev: Vite on 5173 talks to Flask on 5001. Production build: Flask serves the
// bundle itself, so use same-origin (works through any SSH tunnel port).
const API_BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://localhost:5001" : "");

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      // response wasn't JSON — keep statusText
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`);
  return asJson<HealthResponse>(res);
}

export async function searchDatasets(
  query: string,
  size?: number
): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, size }),
  });
  return asJson<SearchResponse>(res);
}

export async function getRecord(recid: number | string): Promise<RecordDetail> {
  const res = await fetch(`${API_BASE}/api/record/${recid}`);
  return asJson<RecordDetail>(res);
}

export async function askAssistant(query: string): Promise<AskResponse> {
  const res = await fetch(`${API_BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return asJson<AskResponse>(res);
}

export async function runAssistant(query: string): Promise<AssistantResponse> {
  const res = await fetch(`${API_BASE}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return asJson<AssistantResponse>(res);
}

export async function runAgent(query: string): Promise<AgentResponse> {
  const res = await fetch(`${API_BASE}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return asJson<AgentResponse>(res);
}
