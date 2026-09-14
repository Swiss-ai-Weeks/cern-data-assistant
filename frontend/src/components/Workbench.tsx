import type { AgentStreamEvent } from "../api";
import type { AgentResponse, HealthResponse, RecordSummary } from "../types";
import AgentTimeline from "./AgentTimeline";
import AnswerCard from "./AnswerCard";
import CollisionView from "./CollisionView";
import ControlRoom from "./ControlRoom";
import DatasetTile from "./DatasetTile";
import PassportSkeleton from "./PassportSkeleton";
import ResearchPassport from "./ResearchPassport";

interface LiveTurn {
  steps: string[];
  text: string;
  result: AgentResponse | null;
  live: boolean;
  error: string | null;
  events: AgentStreamEvent[];
  generatedAt: string | null;
}

interface Props {
  idle: boolean;
  live: LiveTurn | null;
  health: HealthResponse | null;
  query: string;
  presenterOn?: boolean;
  onStarter: (q: string) => void;
  onOpenRecord: (recid: number | string) => void;
  onOpenTrust?: () => void;
}

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

export default function Workbench({
  idle,
  live,
  health,
  query,
  presenterOn,
  onStarter,
  onOpenRecord,
  onOpenTrust,
}: Props) {
  const result = live?.result ?? null;
  const hero = heroRecord(result);
  const datasets = (result?.search?.results ?? []).filter(
    (r) => !hero || String(r.recid) !== String(hero.recid),
  );
  const used = result?.answer?.sources.filter((s) => s.used) ?? [];
  const searchError =
    result?.search === null && live?.error?.includes("CERN")
      ? live.error
      : null;
  const searchPending =
    Boolean(live?.live) &&
    (live?.events.some((e) => e.type === "status" && e.step === "search") ?? false) &&
    !hero &&
    !result?.search;
  const searchEmpty =
    !live?.live && result?.search && (result.search.results?.length ?? 0) === 0;

  if (idle) {
    return (
      <div className="stage idle-stage control-stage">
        <ControlRoom
          health={health}
          busy={false}
          onSubmit={onStarter}
          onOpenTrust={onOpenTrust}
          presenterOn={presenterOn}
        />
      </div>
    );
  }

  const answerGrounded = result?.answer ? result.answer.grounded : null;

  return (
    <div className={`stage live-stage ${presenterOn ? "presenter-focus" : ""}`}>
      {live?.live && !hero && !result?.answer && (
        <div className="live-collision">
          <CollisionView hot telemetry />
        </div>
      )}

      {(live?.live || (live?.events.length ?? 0) > 0) && (
        <AgentTimeline
          events={live?.events ?? []}
          live={Boolean(live?.live)}
          error={live?.error ?? null}
          answerGrounded={answerGrounded}
        />
      )}

      {live?.text && (
        <h2 className="stage-goal">
          {live.live ? "Working on " : ""}
          <em>{live.text}</em>
        </h2>
      )}

      {live?.error && <div className="error-banner">{live.error}</div>}
      {searchError && <div className="error-banner">{searchError}</div>}

      {searchPending && (
        <div className="stage-block passport-block">
          <PassportSkeleton />
        </div>
      )}

      {searchEmpty && (
        <div className="stage-empty" role="status">
          No datasets matched this query in the live catalog. Try broadening collision type or energy
          terms.
        </div>
      )}

      {hero && (
        <div className="stage-block passport-block">
          <ResearchPassport
            record={hero}
            search={result?.search ?? null}
            health={health}
            peers={result?.search?.results ?? []}
            onOpen={() => onOpenRecord(hero.recid)}
          />
        </div>
      )}

      {result?.answer && (
        <div className="stage-block evidence-block">
          <div className="stage-label">Scientific evidence brief</div>
          <AnswerCard
            result={result.answer}
            query={query || result.query}
            onTryGrounded={onStarter}
            generatedAt={live?.generatedAt}
          />
        </div>
      )}

      {datasets.length > 0 && (
        <div className="stage-block">
          <div className="stage-label">
            Related catalog records
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
