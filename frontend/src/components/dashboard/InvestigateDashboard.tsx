import type { Ref } from "react";
import type { AgentStreamEvent } from "../../api";
import type { BeamlinePromptInputHandle } from "../ui/beamline-prompt-input";
import type { AgentResponse, HealthResponse, RecordSummary } from "../../types";
import type { DashTab } from "../../layouts/DashboardShell";
import AnswerCard from "../AnswerCard";
import IntegrityRail from "../IntegrityRail";
import PassportSkeleton from "../PassportSkeleton";
import ResearchPassport from "../ResearchPassport";
import SimpleChatLayout from "../chat/SimpleChatLayout";
import EvidenceCoveragePanel from "./EvidenceCoveragePanel";
import RecordsListPanel from "./RecordsListPanel";
import ResearchBriefPanel from "./ResearchBriefPanel";
import BeamlineComposerStrip from "../chat/BeamlineComposerStrip";
import SessionThread, { type ThreadItem } from "../chat/SessionThread";
import TurnSummary from "../chat/TurnSummary";
import InvestigationWorkspace from "../investigation/InvestigationWorkspace";

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
  followups?: string[];
  onOpenHelp: () => void;
  onOpenTrust: () => void;
  threadItems?: ThreadItem[];
  activeAsstId?: string | null;
  onSelectThread?: (asstId: string) => void;
  onOpenFindData: () => void;
  onFocusInvestigation?: () => void;
  investigationOpen: boolean;
  onOpenInvestigation: () => void;
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

function TrustAbout({ onOpenTrust }: { onOpenTrust: () => void }) {
  return (
    <section className="about-page" aria-labelledby="about-title">
      <h1 id="about-title">About Beamline</h1>
      <p className="about-lede">
        Beamline helps you investigate CERN Open Data: find a record, ask a detector question with
        citations, or compute a real CMS dimuon spectrum. Counts come from the staged sample.
        Interpretations stay labeled.
      </p>
      <button type="button" className="text-link about-trust-link" onClick={onOpenTrust}>
        Trust &amp; safety details
      </button>
      <ol className="trust-steps trust-inline about-trust-list">
        <li>
          <strong>Ask</strong>
          <span>Search the live catalog or ask a detector question in plain English.</span>
        </li>
        <li>
          <strong>Lab</strong>
          <span>Compute the 8 TeV dimuon spectrum, change selections, and inspect events.</span>
        </li>
        <li>
          <strong>Evidence</strong>
          <span>Every claim is labeled calculated, documented, interpretation, or not established.</span>
        </li>
        <li>
          <strong>Handoff</strong>
          <span>Export the recipe, sample checksums, claims, and notebook — or copy a CERN record.</span>
        </li>
      </ol>
    </section>
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
  followups = [],
  onOpenHelp,
  onOpenTrust,
  threadItems = [],
  activeAsstId = null,
  onSelectThread,
  onOpenFindData,
  onFocusInvestigation,
  investigationOpen,
  onOpenInvestigation,
}: Props) {
  if (activeTab === "investigate") {
    if (investigationOpen) {
      return (
        <InvestigationWorkspace health={health} onOpenFindData={onOpenFindData} />
      );
    }

    if (idle) {
      return (
        <SimpleChatLayout
            health={health}
            query={query}
            composerValue={composerValue}
            onComposerChange={onComposerChange}
            onSubmitComposer={onSubmitComposer}
            busy={busy}
            idle
            live={live}
            followups={followups}
            onStarter={onStarter}
            onOpenRecord={onOpenRecord}
            onOpenHelp={onOpenHelp}
            promptInputRef={promptInputRef}
            threadItems={threadItems}
            activeAsstId={activeAsstId}
            onSelectThread={onSelectThread}
            onFocusInvestigation={onFocusInvestigation}
          onOpenLab={onOpenInvestigation}
          />
      );
    }

    return (
      <section className="iv-catalog-band" id="beamline-composer" aria-label="Catalog and documentation results">
        <SimpleChatLayout
          health={health}
          query={query}
          composerValue={composerValue}
          onComposerChange={onComposerChange}
          onSubmitComposer={onSubmitComposer}
          busy={busy}
          idle={false}
          live={live}
          followups={followups}
          onStarter={onStarter}
          onOpenRecord={onOpenRecord}
          promptInputRef={promptInputRef}
          onOpenHelp={onOpenHelp}
          threadItems={threadItems}
          activeAsstId={activeAsstId}
          onSelectThread={onSelectThread}
          onFocusInvestigation={onFocusInvestigation}
        />
      </section>
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
    <div className="dash-tab-view motion-section" key={activeTab}>
      {activeTab !== "about" && (
      <BeamlineComposerStrip
        health={health}
        value={composerValue}
        onChange={onComposerChange}
        onSubmit={onSubmitComposer}
        busy={busy}
        promptInputRef={promptInputRef}
        compact
      />
      )}

      <div className="simple-chat-results dash-tab-results">
        {threadItems.length > 0 && onSelectThread && (
          <SessionThread items={threadItems} activeAsstId={activeAsstId} onSelect={onSelectThread} />
        )}
        {query && (
          <TurnSummary query={query} result={result} goal={live?.text || undefined} search={result?.search ?? null} />
        )}

      {activeTab === "about" && <TrustAbout onOpenTrust={onOpenTrust} />}

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
              peers={allRecords}
            />
          )}
          {!hero && !searchPending && (
            <div className="beamline-card beamline-empty-result">
              <p className="microlabel">No datasets yet</p>
              <p>
                Ask for a dataset first — for example, collisions at 13 TeV with muons. Matching records will appear here.
              </p>
            </div>
          )}
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
      </div>
    </div>
  );
}
