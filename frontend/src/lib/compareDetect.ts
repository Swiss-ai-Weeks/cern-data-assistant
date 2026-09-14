import type { AskResponse } from "../types";

/** True when the user asked to compare two (or more) things and we have CERN sources. */
export function isCompareQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\bvs\.?\b/.test(q) ||
    /\bversus\b/.test(q) ||
    /\bcompare\b/.test(q) ||
    /\bwhich (dataset|format|should)\b/.test(q)
  );
}

export function compareTerms(query: string): string[] {
  const raw = query
    .replace(/^compare\s+/i, "")
    .split(/\s+(?:vs\.?|versus)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (raw.length >= 2) return raw.slice(0, 3);
  return [];
}

export function canShowCompare(query: string, answer: AskResponse | null): boolean {
  if (!answer?.grounded || !isCompareQuery(query)) return false;
  const used = answer.sources.filter((s) => s.used);
  return used.length >= 2 || compareTerms(query).length >= 2;
}
