import { catalogPlainText } from "./catalogText";
import type { RecordSummary } from "../types";

/** LHC Run 2 collision energy used as the meter ceiling. */
export const LHC_TEV = 13;

const SIZE_MUL: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

export type RecordGlance = {
  headline: string;
  context: string;
  path: string | null;
  energyTev: number | null;
  energyLabel: string;
  energyPct: number;
  sizeBytes: number | null;
  sizeLabel: string;
  filesLabel: string;
  runLabel: string;
  formatLabel: string;
  collisionLabel: string;
};

export function parseEnergyTev(raw?: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/\s+/g, "").match(/(\d+(?:\.\d+)?)(TeV|GeV)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if ((m[2] || "TeV").toLowerCase() === "gev") return n / 1000;
  return n;
}

export function parseSizeBytes(record: Pick<RecordSummary, "size_bytes" | "size">): number | null {
  if (record.size_bytes && record.size_bytes > 0) return record.size_bytes;
  const m = (record.size || "").match(/([\d.]+)\s*(TB|GB|MB|KB|B)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  const mul = SIZE_MUL[m[2].toUpperCase()];
  if (!Number.isFinite(n) || !mul) return null;
  return n * mul;
}

export function prettyCollision(raw?: string | null): string {
  const t = (raw || "").toLowerCase().replace(/[\s\-]/g, "");
  if (t === "pp" || t.includes("protonproton")) return "proton–proton";
  if (t === "pbpb" || t.includes("leadlead")) return "lead–lead";
  if (t === "ppb" || t.includes("protonlead")) return "proton–lead";
  return raw || "";
}

export function prettyRun(raw?: string | null): string {
  if (!raw) return "";
  const m = raw.replace(/\s+/g, "").match(/Run(\d{4})([A-Z])?/i);
  if (m) return m[2] ? `Run ${m[1]}${m[2]}` : `Run ${m[1]}`;
  return raw;
}

export function prettyTier(raw?: string | null): string {
  const u = (raw || "").toUpperCase();
  if (u.includes("NANOAOD")) return "NanoAOD";
  if (u.includes("MINIAOD")) return "MiniAOD";
  if (u.includes("AODSIM")) return "AODSIM";
  if (u.includes("AOD")) return "AOD";
  return raw || "";
}

function friendlyPrimary(primary: string): string {
  const map: Record<string, string> = {
    DoubleMuon: "Double muon",
    SingleMuon: "Single muon",
    DoubleEG: "Double electron",
    SingleElectron: "Single electron",
    DoubleElectron: "Double electron",
    ZeroBias: "ZeroBias",
    Charmonium: "Charmonium",
    BTagCSV: "b-tag",
    MuonEG: "Muon + electron",
  };
  if (map[primary]) return map[primary];
  return primary.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function humanDatasetName(title: string): {
  headline: string;
  path: string | null;
  primary: string | null;
  runFromPath: string;
  tierFromPath: string;
} {
  const t = catalogPlainText(title);
  if (t.startsWith("/")) {
    const parts = t.split("/").filter(Boolean);
    const primary = parts[0] || t;
    const era = parts[1]?.split("-")[0] || "";
    const tier = parts[2] || "";
    return {
      headline: friendlyPrimary(primary),
      path: t,
      primary,
      runFromPath: prettyRun(era),
      tierFromPath: prettyTier(tier),
    };
  }
  return { headline: t, path: null, primary: null, runFromPath: "", tierFromPath: "" };
}

export function glanceFromRecord(record: RecordSummary): RecordGlance {
  const named = humanDatasetName(record.title);
  const energyTev = parseEnergyTev(record.collision_energy);
  const collisionLabel = prettyCollision(record.collision_type);
  const runLabel = prettyRun(record.run_period) || named.runFromPath || record.date_published || "";
  const formatLabel =
    prettyTier(record.formats?.[0]) ||
    prettyTier(record.subtype) ||
    named.tierFromPath ||
    "";
  const energyLabel = energyTev != null ? `${energyTev} TeV` : record.collision_energy || "—";
  const filesLabel =
    record.file_count != null && record.file_count > 0 ? String(record.file_count) : "—";
  const context = [record.experiment, energyLabel !== "—" ? energyLabel : "", runLabel, formatLabel]
    .filter(Boolean)
    .join(" · ");

  return {
    headline: named.headline,
    context,
    path: named.path,
    energyTev,
    energyLabel,
    energyPct: energyTev != null ? Math.min(100, Math.round((energyTev / LHC_TEV) * 100)) : 0,
    sizeBytes: parseSizeBytes(record),
    sizeLabel: record.size && record.size !== "—" ? record.size : "—",
    filesLabel,
    runLabel: runLabel || "—",
    formatLabel: formatLabel || "—",
    collisionLabel,
  };
}

export type SizeBar = {
  recid: number | string;
  label: string;
  sizeLabel: string;
  pct: number;
  current: boolean;
};

export function sizeBars(records: RecordSummary[], currentRecid: number | string): SizeBar[] {
  const rows = records
    .map((r) => ({
      recid: r.recid,
      label: humanDatasetName(r.title).headline,
      sizeLabel: r.size && r.size !== "—" ? r.size : "",
      bytes: parseSizeBytes(r) ?? 0,
    }))
    .filter((r) => r.bytes > 0);
  const max = Math.max(...rows.map((r) => r.bytes), 0);
  if (max <= 0) return [];
  return rows
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map((r) => ({
      recid: r.recid,
      label: r.label,
      sizeLabel: r.sizeLabel,
      pct: Math.max(6, Math.round((r.bytes / max) * 100)),
      current: String(r.recid) === String(currentRecid),
    }));
}
