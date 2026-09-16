import type { Ref } from "react";
import type { AgentStreamEvent } from "../../api";
import type { AgentResponse, HealthResponse, RecordSummary } from "../../types";
import { STARTER_QUERIES } from "../../lib/starterQueries";
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
import BeamlineStatusStrip from "../ui/BeamlineStatusStrip";
import { cn } from "../../lib/utils";
import BeamlineComposerStrip from "./BeamlineComposerStrip";
import OtherRecordsList from "./OtherRecordsList";
import SessionThread, { type ThreadItem } from "./SessionThread";
import TurnSummary from "./TurnSummary";
import InvestigationAgentCard from "../investigation/InvestigationAgentCard";
import { storeAgentHandoff } from "../../lib/investigationApi";

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
  followups: string[];
  onStarter: (q: string) => void;
  onOpenRecord: (recid: number | string) => void;
  onOpenHelp: () => void;
  promptInputRef?: Ref<BeamlinePromptInputHandle>;
  threadItems?: ThreadItem[];
  activeAsstId?: string | null;
  onSelectThread?: (asstId: string) => void;
  onFocusInvestigation?: () => void;
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
  followups,
  onStarter,
  onOpenRecord,
  onOpenHelp,
  promptInputRef,
  threadItems = [],
  activeAsstId = null,
  onSelectThread,
  onFocusInvestigation,
}: Props) {
  const result = live?.result ?? null;
  const hero = heroRecord(result);
  const allRecords = result?.search?.results ?? [];
  const answer = result?.answer ?? null;
  const answerGrounded = answer ? answer.grounded : null;
  const searchPending =
    Boolean(live?.live) &&
    (live?.events.some((e) => e.type === "status" && e.step === "search") ?? false) &&
    !hero &&
    !result?.search;

  return (
    <div className={cn("simple-chat", idle && "simple-chat-idle")}>
      {idle ? (
        <>
          <BeamlineStatusStrip health={health} />
          <div className="beamline-sticky-composer">
            <BeamlineHero />
            <div className="simple-chat-input-wrap">
              <BeamlinePromptInput
                ref={promptInputRef}
                value={composerValue}
                onChange={onComposerChange}
                onSubmit={onSubmitComposer}
                busy={busy}
                placeholder="Ask about CERN datasets or detectors…"
              />
            </div>
            {busy && (
              <p className="composer-busy-hint" role="status" aria-live="polite">
                Beamline is working on your question…
              </p>
            )}
          </div>
          <div className="simple-chat-chips">
            <p className="microlabel simple-chat-chips-label">Try a question</p>
            {STARTER_QUERIES.map((q) => (
              <button key={q} type="button" className="example-chip" disabled={busy} onClick={() => onStarter(q)}>
                {q}
              </button>
            ))}
          </div>
          <p className="simple-chat-onboarding">
            New here?{" "}
            <button type="button" className="text-link" onClick={onOpenHelp}>
              Read how Beamline works
            </button>
          </p>
        </>
      ) : (
        <BeamlineComposerStrip
          health={health}
          value={composerValue}
          onChange={onComposerChange}
          onSubmit={onSubmitComposer}
          busy={busy}
          promptInputRef={promptInputRef}
        />
      )}

      {!idle && (
        <div className="simple-chat-results">
          {threadItems.length > 0 && onSelectThread && (
            <SessionThread items={threadItems} activeAsstId={activeAsstId} onSelect={onSelectThread} />
          )}
          {query && <TurnSummary query={query} result={result} goal={live?.text || undefined} />}

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

          {result?.search?.constraint_notes && result.search.constraint_notes.length > 0 && (
            <div className="constraint-banner" role="status">
              {result.search.constraint_notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          )}

          {searchPending && <PassportSkeleton />}

          {result?.investigation && (
            <InvestigationAgentCard
              data={result.investigation}
              onOpenWorkspace={() => {
                const inv = result.investigation;
                if (inv?.ready && inv.run) {
                  storeAgentHandoff({
                    run: inv.run as import("../../lib/investigationApi").Run,
                    baselineRunId: inv.baseline_run_id ?? null,
                    spec: {
                      min_pt: inv.run.spec.min_pt,
                      max_abs_eta: inv.run.spec.max_abs_eta,
                      charge: inv.run.spec.charge as import("../../lib/investigationApi").Selection["charge"],
                    },
                    focusBin: /bump|peak|30/.test(query.toLowerCase()) ? 30 : null,
                  });
                }
                onFocusInvestigation?.();
              }}
            />
          )}

          {hero && (
            <ResearchPassport
              record={hero}
              search={result?.search ?? null}
              health={health}
              onOpen={() => onOpenRecord(hero.recid)}
              peers={allRecords}
            />
          )}

          {answer?.grounded && (
            <div className="beamline-card beamline-result-card">
              <AnswerCard
                result={answer}
                query={query}
                onTryGrounded={onStarter}
                generatedAt={live?.generatedAt}
              />
            </div>
          )}

          {answer && !answer.grounded && (
            <div className="beamline-card beamline-result-card beamline-integrity-card">
              <IntegrityRail result={answer} onTryGrounded={onStarter} />
            </div>
          )}

          {!hero && !answer && !live?.live && !live?.error && result && (
            <div className="beamline-card beamline-empty-result">
              <p className="microlabel">No structured result</p>
              <p>Try rephrasing your question, or open Help for examples of dataset vs detector queries.</p>
            </div>
          )}

          {allRecords.length > 0 && (
            <OtherRecordsList records={allRecords} heroRecid={hero?.recid} onOpen={onOpenRecord} />
          )}

          {followups.length > 0 && !busy && (
            <section className="beamline-card beamline-followups" aria-label="Suggested follow-ups">
              <p className="microlabel">Continue with</p>
              <div className="followups-row">
                {followups.map((q) => (
                  <button key={q} type="button" className="example-chip" onClick={() => onStarter(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
