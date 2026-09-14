import type { Ref } from "react";
import type { AgentStreamEvent } from "../../api";
import type { BeamlinePromptInputHandle } from "../ui/beamline-prompt-input";
import type { AgentResponse, HealthResponse, RecordSummary } from "../../types";
import type { DashTab } from "../../layouts/DashboardShell";
import AnswerCard from "../AnswerCard";
import IntegrityRail from "../IntegrityRail";
import PassportSkeleton from "../PassportSkeleton";
import ResearchPassport from "../ResearchPassport";
import Panel from "../ui/Panel";
import SimpleChatLayout from "../chat/SimpleChatLayout";
import EvidenceCoveragePanel from "./EvidenceCoveragePanel";
import RecordsListPanel from "./RecordsListPanel";
import ResearchBriefPanel from "./ResearchBriefPanel";
import BeamlineHero from "../ui/BeamlineHero";

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
  activeTab: DashTab;
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
  onFocusEvidence: () => void;
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

function TrustAbout() {
  return (
    <Panel title="How Beamline earns trust">
      <ol className="trust-steps trust-inline">
        <li>
          <strong>English intent</strong>
          <span>Planner routes to live catalog search, CERN docs, or both.</span>
        </li>
        <li>
          <strong>CERN catalog &amp; documents</strong>
          <span>Real calls to opendata.cern.ch and a local grounding index.</span>
        </li>
        <li>
          <strong>Evidence checks</strong>
          <span>Retrieval floor, citation validation, fact-check before release.</span>
        </li>
        <li>
          <strong>Research handoff</strong>
          <span>recid, DOI, files, download command — or cited answers with receipts.</span>
        </li>
      </ol>
    </Panel>
  );
}

export default function InvestigateDashboard({
  activeTab,
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
  onFocusEvidence,
  promptInputRef,
}: Props) {
  if (activeTab === "investigate") {
    return (
      <SimpleChatLayout
        health={health}
        query={query}
        composerValue={composerValue}
        onComposerChange={onComposerChange}
        onSubmitComposer={onSubmitComposer}
        busy={busy}
        idle={idle}
        live={live}
        onStarter={onStarter}
        onOpenRecord={onOpenRecord}
        promptInputRef={promptInputRef}
      />
    );
  }

  const result = live?.result ?? null;
  const hero = heroRecord(result);
  const allRecords = result?.search?.results ?? [];
  const answer = result?.answer ?? null;
  const searchPending =
    Boolean(live?.live) &&
    (live?.events.some((e) => e.type === "status" && e.step === "search") ?? false) &&
    !hero &&
    !result?.search;

  return (
    <>
      <div className="dash-secondary-head card-enter">
        <BeamlineHero compact />
      </div>

      {activeTab === "about" && <TrustAbout />}

      {activeTab === "evidence" && answer?.grounded && (
        <div className="dash-focus-block card-enter">
          <AnswerCard result={answer} query={query} onTryGrounded={onStarter} generatedAt={live?.generatedAt} />
        </div>
      )}

      {activeTab === "integrity" && answer && !answer.grounded && (
        <div className="dash-focus-block card-enter">
          <IntegrityRail result={answer} onTryGrounded={onStarter} />
        </div>
      )}

      {activeTab === "datasets" && (
        <div className="dash-focus-block">
          {searchPending && <PassportSkeleton />}
          {hero && (
            <ResearchPassport
              record={hero}
              search={result?.search ?? null}
              health={health}
              onOpen={() => onOpenRecord(hero.recid)}
            />
          )}
          {!hero && !searchPending && <p className="dash-muted">No dataset handoff yet — run a catalog search.</p>}
          <RecordsListPanel records={allRecords} heroRecid={hero?.recid} onOpen={onOpenRecord} />
        </div>
      )}

      {(activeTab === "evidence" || activeTab === "integrity") && (
        <div className="dash-grid">
          <EvidenceCoveragePanel answer={answer} live={Boolean(live?.live)} />
          <RecordsListPanel records={allRecords} heroRecid={hero?.recid} onOpen={onOpenRecord} />
          <ResearchBriefPanel
            answer={answer}
            onOpenEvidence={() => {
              if (answer?.grounded) onFocusEvidence();
            }}
            onTryGrounded={() => onStarter("Why does CMS use a solenoid?")}
          />
        </div>
      )}

      {activeTab === "evidence" && !answer?.grounded && (
        <ResearchBriefPanel
          answer={answer}
          onOpenEvidence={onFocusEvidence}
          onTryGrounded={() => onStarter("Why does CMS use a solenoid?")}
        />
      )}
    </>
  );
}
