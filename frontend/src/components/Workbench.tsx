import type { AgentResponse, RecordSummary } from "../types";
import AnswerCard from "./AnswerCard";
import BoardingPass from "./BoardingPass";
import DatasetTile from "./DatasetTile";

const STARTERS = [
  {
    k: "01",
    title: "Find 13 TeV muon data",
    query: "proton-proton collisions at 13 TeV with muons",
  },
  {
    k: "02",
    title: "Refuse a hallucination",
    query: "How do black holes evaporate?",
  },
  {
    k: "03",
    title: "Why CMS uses a solenoid",
    query: "Why does CMS use a solenoid?",
  },
  {
    k: "04",
    title: "Search + explain, one turn",
    query: "find CMS muon datasets and explain why CMS uses a solenoid",
  },
];

function heroRecord(result: AgentResponse | null): RecordSummary | null {
  if (!result?.search?.results?.length && !result?.picked) return null;
  const results = result.search?.results ?? [];
  if (result.picked) {
    const match = results.find((r) => String(r.recid) === String(result.picked?.recid));
    return {
      ...(match || ({} as RecordSummary)),
      ...result.picked,
      title: result.picked.title || match?.title || `Record ${result.picked.recid}`,
      picked: true,
    } as RecordSummary;
  }
  return results.find((r) => r.is_dataset) || results[0] || null;
}

const NODES = [
  { id: "planning", label: "Plan" },
  { id: "search", label: "Search" },
  { id: "ask", label: "Ground" },
  { id: "fetch_record", label: "Fetch" },
];

interface LiveTurn {
  steps: string[];
  text: string;
  result: AgentResponse | null;
  live: boolean;
  error: string | null;
}

interface Props {
  idle: boolean;
  live: LiveTurn | null;
  onStarter: (q: string) => void;
  onOpenRecord: (recid: number | string) => void;
}

function activeNode(live: LiveTurn | null): string | null {
  if (!live) return null;
  if (live.result) return "done";
  const last = live.steps[live.steps.length - 1] || "";
  if (/fetch|Opening the top/i.test(last)) return "fetch_record";
  if (/Retrieving CERN|grounded/i.test(last)) return "ask";
  if (/Search|retry/i.test(last)) return "search";
  if (/Plan/i.test(last)) return "planning";
  return "planning";
}

export default function Workbench({ idle, live, onStarter, onOpenRecord }: Props) {
  const node = activeNode(live);
  const result = live?.result;
  const hero = heroRecord(result);
  const datasets = (result?.search?.results ?? []).filter(
    (r) => !hero || String(r.recid) !== String(hero.recid),
  );
  const used = result?.answer?.sources.filter((s) => s.used) ?? [];

  if (idle) {
    return (
      <div className="stage idle-stage">
        <div className="hero-word" aria-hidden>
          beamline
        </div>
        <p className="microlabel">CERN Open Data — Swiss AI Weeks 2026</p>
        <h2 className="stage-title">
          Ask CERN, <em>in English.</em>
        </h2>
        <p className="stage-lead">
          Plain English in — datasets and detectors out. If it cannot cite CERN,
          it will not guess.
        </p>
        <div className="launch-grid">
          {STARTERS.map((s) => (
            <button key={s.k} type="button" className="launch-tile" onClick={() => onStarter(s.query)}>
              <span className="launch-k">{s.k}</span>
              <strong>{s.title}</strong>
              <span className="launch-q">{s.query}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stage live-stage">
      <div className="pipe" aria-label="Agent pipeline">
        {NODES.map((n, i) => {
          const order = ["planning", "search", "ask", "fetch_record"];
          const nowId = node === "done" ? null : node;
          const ni = order.indexOf(n.id);
          const ai = nowId ? order.indexOf(nowId) : -1;
          const used = result?.tools_used || [];
          const finished =
            n.id === "planning"
              ? Boolean(result) || Boolean(live?.text)
              : n.id === "fetch_record"
                ? used.includes("fetch_record")
                : used.includes(n.id);
          const on = live?.live ? ni <= Math.max(ai, 0) : finished;
          const now = Boolean(live?.live && n.id === nowId);
          return (
            <div key={n.id} className="pipe-wrap">
              {i > 0 && <div className={`pipe-line ${on ? "hot" : ""}`} />}
              <div className={`pipe-node ${on ? "on" : ""} ${now ? "now" : ""}`}>
                <span>{n.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {live?.text && (
        <h2 className="stage-goal">
          {live.live ? "Working on " : ""}
          <em>{live.text}</em>
        </h2>
      )}

      {live?.error && <div className="error-banner">{live.error}</div>}

      {live?.live && (
        <ol className="stage-log">
          {live.steps.map((s, i) => (
            <li key={i} className={i === live.steps.length - 1 ? "now" : ""}>
              {s}
            </li>
          ))}
        </ol>
      )}

      {hero && (
        <div className="stage-block">
          <BoardingPass record={hero} onOpen={() => onOpenRecord(hero.recid)} />
        </div>
      )}

      {result?.answer && (
        <div className="stage-block">
          <div className="stage-label">{result.answer.grounded ? "Grounded answer" : "The rail"}</div>
          <AnswerCard result={result.answer} />
        </div>
      )}

      {datasets.length > 0 && (
        <div className="stage-block">
          <div className="stage-label">
            Datasets
            <span>
              {datasets.length} of {result?.search?.total_matches?.toLocaleString()}
            </span>
          </div>
          <div className="ds-rail">
            {datasets.map((r) => (
              <DatasetTile key={r.recid} record={r} onOpen={() => onOpenRecord(r.recid)} />
            ))}
          </div>
        </div>
      )}

      {used.length > 0 && (
        <div className="stage-block">
          <div className="stage-label">Cited CERN sources</div>
          <div className="cite-rail">
            {used.map((s) => (
              <a key={s.n} href={s.source} target="_blank" rel="noreferrer" className="cite-pill">
                [{s.n}] {s.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
