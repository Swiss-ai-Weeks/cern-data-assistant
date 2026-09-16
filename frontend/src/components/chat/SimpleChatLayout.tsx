import type { Ref } from "react";
import type { AgentStreamEvent } from "../../api";
import type { AgentResponse, HealthResponse, RecordSummary } from "../../types";
import AgentTimeline from "../AgentTimeline";
import AnswerCard from "../AnswerCard";
import IntegrityRail from "../IntegrityRail";
import PassportSkeleton from "../PassportSkeleton";
import ResearchPassport from "../ResearchPassport";
import {
  type BeamlinePromptInputHandle,
} from "../ui/beamline-prompt-input";
import { cn } from "../../lib/utils";
import BeamlineComposerStrip from "./BeamlineComposerStrip";
import OtherRecordsList from "./OtherRecordsList";
import SessionThread, { type ThreadItem } from "./SessionThread";
import TurnSummary from "./TurnSummary";
import InvestigationAgentCard from "../investigation/InvestigationAgentCard";
import { storeAgentHandoff } from "../../lib/investigationApi";
import HomeLanding from "../home/HomeLanding";

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
  onOpenLab?: () => void;
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
  onOpenLab,
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
  const otherRecords = allRecords.filter((r) => String(r.recid) !== String(hero?.recid));

  if (idle) {
    return (
      <div className={cn("simple-chat", "simple-chat-idle")}>
        <HomeLanding
          composerValue={composerValue}
          onComposerChange={onComposerChange}
          onSubmitComposer={onSubmitComposer}
          busy={busy}
          promptInputRef={promptInputRef}
          onStarter={onStarter}
          onOpenLab={() => onOpenLab?.()}
          onOpenHelp={onOpenHelp}
        />
      </div>
    );
  }

  return (
    <div className="simple-chat">
      <BeamlineComposerStrip
        health={health}
        value={composerValue}
        onChange={onComposerChange}
        onSubmit={onSubmitComposer}
        busy={busy}
        promptInputRef={promptInputRef}
      />

      <div className="simple-chat-results">
        {threadItems.length > 0 && onSelectThread && (
          <SessionThread items={threadItems} activeAsstId={activeAsstId} onSelect={onSelectThread} />
        )}
        {query && (
          <TurnSummary
            query={query}
            result={result}
            goal={live?.text || undefined}
            search={result?.search ?? null}
          />
        )}

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

        {live?.error && (
          <div className="error-banner" role="alert">
            {live.error}
          </div>
        )}

        {result?.search?.constraint_notes && result.search.constraint_notes.length > 0 && (
          <div
            className={`constraint-banner constraint-banner-${result.search.constraint_match ?? "catalog"}`}
            role="status"
            aria-live="polite"
          >
            <p className="constraint-banner-title">
              {result.search.constraint_match === "energy_mismatch" || result.search.constraint_match === "experiment_mismatch"
                ? "Catalog results only — the runnable sample did not change"
                : "Dataset constraints applied to this search"}
            </p>
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
            <p>Try naming an energy, experiment, or detector — or open Help for examples.</p>
          </div>
        )}

        {otherRecords.length > 0 && (
          <OtherRecordsList records={allRecords} heroRecid={hero?.recid} onOpen={onOpenRecord} />
        )}

        {followups.length > 0 && !busy && (
          <section className="beamline-followups" aria-label="Suggested follow-ups">
            <p className="microlabel">Continue</p>
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
    </div>
  );
}
