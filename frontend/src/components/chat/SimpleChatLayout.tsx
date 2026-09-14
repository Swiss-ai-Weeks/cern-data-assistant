import type { Ref } from "react";
import type { AgentStreamEvent } from "../../api";
import type { AgentResponse, HealthResponse, RecordSummary } from "../../types";
import { EXAMPLE_QUERIES } from "../../lib/demoQueries";
import AgentTimeline from "../AgentTimeline";
import AnswerCard from "../AnswerCard";
import IntegrityRail from "../IntegrityRail";
import PassportSkeleton from "../PassportSkeleton";
import ResearchPassport from "../ResearchPassport";
import {
  BeamlinePromptInput,
  type BeamlinePromptInputHandle,
} from "../ui/beamline-prompt-input";
import BeamlineHero from "../ui/BeamlineHero";
import { cn } from "../../lib/utils";

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
  health: HealthResponse | null;
  query: string;
  composerValue: string;
  onComposerChange: (v: string) => void;
  onSubmitComposer: () => void;
  busy: boolean;
  idle: boolean;
  live: LiveTurn | null;
  onStarter: (q: string) => void;
  onOpenRecord: (recid: number | string) => void;
  promptInputRef?: Ref<BeamlinePromptInputHandle>;
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

export default function SimpleChatLayout({
  health,
  query,
  composerValue,
  onComposerChange,
  onSubmitComposer,
  busy,
  idle,
  live,
  onStarter,
  onOpenRecord,
  promptInputRef,
}: Props) {
  const result = live?.result ?? null;
  const hero = heroRecord(result);
  const answer = result?.answer ?? null;
  const answerGrounded = answer ? answer.grounded : null;
  const searchPending =
    Boolean(live?.live) &&
    (live?.events.some((e) => e.type === "status" && e.step === "search") ?? false) &&
    !hero &&
    !result?.search;

  const cernOnline = health?.cern_api === "ok";
  const modelName =
    health?.ollama === "ok" ? health.ollama_model : health ? "Model offline" : null;
  const kbChunks = health?.knowledge_chunks;

  return (
    <div className={cn("simple-chat", idle && "simple-chat-idle")}>
      {idle && <BeamlineHero />}

      <div className="simple-chat-input-stack">
        <div className="simple-chat-input-wrap">
          <BeamlinePromptInput
            ref={promptInputRef}
            value={composerValue}
            onChange={onComposerChange}
            onSubmit={onSubmitComposer}
            busy={busy}
            placeholder="Collisions, datasets, detectors…"
          />
        </div>

        {idle && health && (
          <p className="simple-chat-context" aria-label="System context">
            <span className={cernOnline ? "ctx-ok" : "ctx-warn"}>
              Catalog {cernOnline ? "online" : "offline"}
            </span>
            <span className="ctx-sep" aria-hidden>
              ·
            </span>
            {modelName && <span>{modelName}</span>}
            {kbChunks != null && kbChunks > 0 && (
              <>
                <span className="ctx-sep" aria-hidden>
                  ·
                </span>
                <span>{kbChunks.toLocaleString()} doc sources</span>
              </>
            )}
          </p>
        )}
      </div>

      {idle && (
        <div className="simple-chat-chips">
          {EXAMPLE_QUERIES.map((q) => (
            <button key={q} type="button" className="example-chip" disabled={busy} onClick={() => onStarter(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      {!idle && (
        <div className="simple-chat-results">
          {live?.live && (
            <AgentTimeline
              events={live.events}
              live
              error={live.error}
              answerGrounded={answerGrounded}
            />
          )}
          {!live?.live && live?.error && (
            <AgentTimeline
              events={live.events}
              live={false}
              error={live.error}
              answerGrounded={answerGrounded}
            />
          )}

          {live?.error && <div className="error-banner">{live.error}</div>}

          {searchPending && <PassportSkeleton />}

          {hero && (
            <ResearchPassport
              record={hero}
              search={result?.search ?? null}
              health={health}
              onOpen={() => onOpenRecord(hero.recid)}
            />
          )}

          {answer?.grounded && (
            <AnswerCard
              result={answer}
              query={query}
              onTryGrounded={onStarter}
              generatedAt={live?.generatedAt}
            />
          )}

          {answer && !answer.grounded && <IntegrityRail result={answer} onTryGrounded={onStarter} />}
        </div>
      )}
    </div>
  );
}
