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

export async function runAgent(
  query: string,
  history?: { role: string; content: string }[],
): Promise<AgentResponse> {
  const res = await fetch(`${API_BASE}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, history }),
  });
  return asJson<AgentResponse>(res);
}

export type AgentStreamEvent =
  | { type: "status"; step: string; label: string }
  | { type: "plan"; goal?: string; search_query?: string | null; ask_query?: string | null }
  | { type: "tool_done"; tool: string; hits?: number; grounded?: boolean; recid?: string | number }
  | { type: "result"; payload: AgentResponse }
  | { type: "error"; error: string };

export async function* streamAgent(
  query: string,
  history?: { role: string; content: string }[],
): AsyncGenerator<AgentStreamEvent> {
  const res = await fetch(`${API_BASE}/api/agent/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ query, history }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Agent stream failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(6)) as AgentStreamEvent;
      } catch {
        /* ignore a torn JSON frame */
      }
    }
  }
}
