import type { AgentResponse } from "../types";

const STORAGE_KEY = "beamline-session-v1";

export type SessionTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps: string[];
  result: AgentResponse | null;
  error: string | null;
  generatedAt: string | null;
};

export function loadInvestigationSession(): SessionTurn[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionTurn[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.filter((t) => t && typeof t.id === "string" && (t.role === "user" || t.role === "assistant"));
  } catch {
    return null;
  }
}

export function saveInvestigationSession(turns: SessionTurn[]): void {
  try {
    if (turns.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-24)));
  } catch {
    // quota or private mode — ignore
  }
}

export function clearInvestigationSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
