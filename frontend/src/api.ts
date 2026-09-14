import type {
  AskResponse,
  HealthResponse,
  RecordDetail,
  SearchResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";

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
