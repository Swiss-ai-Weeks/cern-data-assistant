export type BriefPoint = {
  text: string;
  cites: number[];
};

export type BriefMetric = {
  label: string;
  value: string;
  numeric: number | null;
  unit: string;
  cites: number[];
};

export type BriefCompare = {
  item: string;
  fact: string;
  cites: number[];
};

export type AnswerBrief = {
  takeaway: string;
  points: BriefPoint[];
  metrics: BriefMetric[];
  compare: BriefCompare[];
};

export function citationNums(text: string): number[] {
  return [...text.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));
}

function splitSentences(answer: string): string[] {
  return answer
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function bareLength(text: string): number {
  return text.replace(/\[\d{1,3}\]/g, "").trim().length;
}

function stripCiteMarks(text: string): string {
  return text.replace(/\[\d{1,3}\]/g, "").replace(/\s{2,}/g, " ").trim();
}

function parseNumber(text: string): { n: number; unit: string } | null {
  const m = stripCiteMarks(text).match(/(-?\d+(?:[.,]\d+)?)\s*([A-Za-zµμ°/%]+)?/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return { n, unit: (m[2] || "").trim() };
}

function splitPipes(line: string): string[] {
  return line.split("|").map((part) => part.trim()).filter(Boolean);
}

/** Turn a model paragraph into a scannable briefing. */
export function splitAnswer(answer: string): { takeaway: string; points: BriefPoint[] } {
  const sentences = splitSentences(answer);
  if (sentences.length === 0) {
    return { takeaway: answer.trim(), points: [] };
  }

  let takeaway = sentences[0];
  let rest = sentences.slice(1);

  if (bareLength(takeaway) < 48 && rest.length > 0) {
    takeaway = `${takeaway} ${rest[0]}`;
    rest = rest.slice(1);
  }

  const points = rest.slice(0, 6).map((text) => ({
    text,
    cites: citationNums(text),
  }));

  return { takeaway, points };
}

/** Parse TAKEAWAY / bullets / METRICS / COMPARE, with prose fallback. */
export function parseAnswerBrief(answer: string): AnswerBrief {
  const raw = (answer || "").replace(/\r/g, "").trim();
  if (!raw) {
    return { takeaway: "", points: [], metrics: [], compare: [] };
  }

  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const looksStructured = lines.some(
    (line) =>
      /^TAKEAWAY:\s*/i.test(line) ||
      /^[-*•]\s+/.test(line) ||
      /^(METRICS|COMPARE)\s*$/i.test(line) ||
      (line.includes("|") && /\[\d{1,3}\]/.test(line)),
  );

  if (!looksStructured) {
    const fallback = splitAnswer(raw);
    return { ...fallback, metrics: [], compare: [] };
  }

  let takeaway = "";
  const points: BriefPoint[] = [];
  const metrics: BriefMetric[] = [];
  const compare: BriefCompare[] = [];
  let mode: "body" | "metrics" | "compare" = "body";

  for (const line of lines) {
    if (/^METRICS\s*$/i.test(line)) {
      mode = "metrics";
      continue;
    }
    if (/^COMPARE\s*$/i.test(line)) {
      mode = "compare";
      continue;
    }

    const labeled = /^TAKEAWAY:\s*(.+)$/i.exec(line);
    if (labeled) {
      takeaway = labeled[1].trim();
      mode = "body";
      continue;
    }

    if (mode === "metrics" && line.includes("|")) {
      const parts = splitPipes(line);
      if (parts.length >= 2) {
        const label = stripCiteMarks(parts[0]);
        const value = parts[1];
        const parsed = parseNumber(value);
        metrics.push({
          label,
          value: stripCiteMarks(value),
          numeric: parsed?.n ?? null,
          unit: parsed?.unit ?? "",
          cites: citationNums(line),
        });
      }
      continue;
    }

    if (mode === "compare" && line.includes("|")) {
      const parts = splitPipes(line);
      if (parts.length >= 2) {
        compare.push({
          item: stripCiteMarks(parts[0]),
          fact: parts.slice(1).filter((p) => !/^\[\d{1,3}\]+$/.test(p)).join(" · "),
          cites: citationNums(line),
        });
      }
      continue;
    }

    const bullet = /^(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line);
    if (bullet) {
      points.push({ text: bullet[1].trim(), cites: citationNums(bullet[1]) });
      mode = "body";
      continue;
    }

    if (mode !== "body") continue;

    if (!takeaway) takeaway = line;
    else points.push({ text: line, cites: citationNums(line) });
  }

  if (!takeaway && points.length) {
    takeaway = points[0].text;
    points.splice(0, 1);
  }

  return {
    takeaway: takeaway || raw,
    points: points.slice(0, 6),
    metrics: metrics.slice(0, 6),
    compare: compare.slice(0, 4),
  };
}

export function metricsCanChart(metrics: BriefMetric[]): boolean {
  const numbered = metrics.filter((m) => m.numeric != null && m.numeric > 0);
  if (numbered.length < 2) return false;
  const units = new Set(numbered.map((m) => m.unit.toLowerCase()));
  return units.size === 1;
}
