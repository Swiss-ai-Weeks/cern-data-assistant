import { useState, type Ref } from "react";
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
    <Panel title="About Beamline">
      <p className="about-lede">
        Beamline is a hosted assistant for CERN Open Data: catalog search, cited documentation answers, and explicit
        refusals when sources do not support a claim.
      </p>
      <button type="button" className="text-link about-trust-link" onClick={onOpenTrust}>
        Trust &amp; safety details
      </button>
      <ol className="trust-steps trust-inline about-trust-list">
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
  followups = [],
  onOpenHelp,
  onOpenTrust,
  threadItems = [],
  activeAsstId = null,
  onSelectThread,
}: Props) {
  const [investigationOpen, setInvestigationOpen] = useState(false);
  if (activeTab === "investigate") {
    if (investigationOpen) return <InvestigationWorkspace onClose={() => setInvestigationOpen(false)} />;
    return (
      <>
        {idle && <section className="iv-launch-card" aria-label="Guided CERN investigation">
          <div><p className="iv-eyebrow">NEW · WORKING WITH REAL DATA</p><h2>Run a CERN investigation, not just a search.</h2><p>Compute a CMS muon spectrum, change the selection, and inspect the evidence behind a documented feature.</p></div>
          <button type="button" onClick={() => setInvestigationOpen(true)}>Open the dimuon lab →</button>
        </section>}
        <SimpleChatLayout
          health={health}
          query={query}
          composerValue={composerValue}
          onComposerChange={onComposerChange}
          onSubmitComposer={onSubmitComposer}
          busy={busy}
          idle={idle}
          live={live}
          followups={followups}
          onStarter={onStarter}
          onOpenRecord={onOpenRecord}
          promptInputRef={promptInputRef}
          onOpenHelp={onOpenHelp}
          threadItems={threadItems}
          activeAsstId={activeAsstId}
          onSelectThread={onSelectThread}
        />
      </>
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
      <BeamlineComposerStrip
        health={health}
        value={composerValue}
        onChange={onComposerChange}
        onSubmit={onSubmitComposer}
        busy={busy}
        promptInputRef={promptInputRef}
        compact
      />

      <div className="simple-chat-results dash-tab-results">
        {threadItems.length > 0 && onSelectThread && (
          <SessionThread items={threadItems} activeAsstId={activeAsstId} onSelect={onSelectThread} />
        )}
        {query && <TurnSummary query={query} result={result} goal={live?.text || undefined} />}

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
                Run a catalog search from Home — for example, collisions at 13 TeV with muons — then return here for
                the full list.
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
