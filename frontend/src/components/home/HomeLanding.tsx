import type { Ref } from "react";
import { STARTER_QUERIES } from "../../lib/starterQueries";
import {
  BeamlinePromptInput,
  type BeamlinePromptInputHandle,
} from "../ui/beamline-prompt-input";

interface Props {
  composerValue: string;
  onComposerChange: (v: string) => void;
  onSubmitComposer: () => void;
  busy: boolean;
  promptInputRef?: Ref<BeamlinePromptInputHandle>;
  onStarter: (q: string) => void;
  onOpenLab: () => void;
  onOpenHelp: () => void;
}

const PATHS = [
  {
    id: "find",
    index: "01",
    kicker: "Discover",
    title: "Locate the right collision data",
    hint: "Describe the experiment, energy, or physics object. Beamline resolves it against the live CERN catalog.",
    query: STARTER_QUERIES[0].query,
  },
  {
    id: "lab",
    index: "02",
    kicker: "Investigate",
    title: "Test a selection on real events",
    hint: "Recompute a CMS dimuon spectrum, compare revisions, and inspect the events inside any mass bin.",
  },
  {
    id: "docs",
    index: "03",
    kicker: "Understand",
    title: "Question the apparatus",
    hint: "Get an answer from CERN documentation with exact sources, confidence, and an explicit refusal when evidence is missing.",
    query: STARTER_QUERIES[1].query,
  },
] as const;

export default function HomeLanding({
  composerValue,
  onComposerChange,
  onSubmitComposer,
  busy,
  promptInputRef,
  onStarter,
  onOpenLab,
  onOpenHelp,
}: Props) {
  return (
    <section className="home" aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-intro">
          <p className="home-kicker"><span aria-hidden /> CERN Open Data, made investigable</p>
          <h1 className="home-title" id="home-title">
            From a physics question
            <em>to a reproducible result.</em>
          </h1>
          <p className="home-lede">
            Find collision datasets, interrogate detector documentation, and test selections on real CMS events. Every result keeps its evidence attached.
          </p>

          <div className="home-composer" id="beamline-composer">
            <label className="home-composer-label" htmlFor="beamline-query">What do you want to investigate?</label>
            <BeamlinePromptInput
              ref={promptInputRef}
              value={composerValue}
              onChange={onComposerChange}
              onSubmit={onSubmitComposer}
              busy={busy}
              placeholder="Try “proton–proton collisions at 13 TeV with muons”"
            />
            {busy && (
              <p className="composer-busy-hint" role="status" aria-live="polite">
                Searching the catalog and reading CERN sources…
              </p>
            )}
          </div>
        </div>

        <aside className="home-proof" aria-label="Scientific chain of custody">
          <p className="home-proof-label">Scientific chain of custody</p>
          <ol>
            <li><span>01</span><strong>Query</strong><small>Natural language intent</small></li>
            <li><span>02</span><strong>Compute</strong><small>Deterministic analysis</small></li>
            <li><span>03</span><strong>Verify</strong><small>Sources + checksums</small></li>
            <li><span>04</span><strong>Export</strong><small>Notebook + recipe</small></li>
          </ol>
          <button type="button" className="home-lab-cta" onClick={onOpenLab}>
            Open the live CMS investigation <span aria-hidden>→</span>
          </button>
        </aside>
      </div>

      <div className="home-examples" aria-label="Example questions">
        {STARTER_QUERIES.map((item) => (
          <button
            key={item.query}
            type="button"
            className="example-chip"
            disabled={busy}
            onClick={() => onStarter(item.query)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="home-paths" aria-label="Ways to use Beamline">
        {PATHS.map((path) => (
          <button
            key={path.id}
            type="button"
            className="home-path"
            disabled={busy && path.id !== "lab"}
            onClick={() => {
              if (path.id === "lab") onOpenLab();
              else if ("query" in path && path.query) onStarter(path.query);
            }}
          >
            <span className="home-path-index">{path.index}</span>
            <span className="home-path-copy">
              <span className="home-path-kicker">{path.kicker}</span>
              <strong className="home-path-title">{path.title}</strong>
              <span className="home-path-hint">{path.hint}</span>
            </span>
            <span className="home-path-arrow" aria-hidden>↗</span>
          </button>
        ))}
      </div>

      <p className="home-help">
        Built for researchers and curious first-time users. <button type="button" className="text-link" onClick={onOpenHelp}>See how evidence is handled</button>
      </p>
    </section>
  );
}
