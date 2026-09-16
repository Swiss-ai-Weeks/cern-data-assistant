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
    kicker: "Catalog",
    title: "Find a dataset",
    hint: "Energy, experiment, and files from the live CERN portal.",
    query: STARTER_QUERIES[0].query,
  },
  {
    id: "lab",
    kicker: "Analysis",
    title: "Run the CMS lab",
    hint: "Compute a real dimuon spectrum and inspect a documented bump.",
  },
  {
    id: "docs",
    kicker: "Documentation",
    title: "Ask a detector",
    hint: "Cited answers from CERN sources — or a clear refusal.",
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
    <section className="home" aria-label="Start an investigation">
      <header className="home-intro">
        <p className="home-kicker">CERN Open Data</p>
        <h1 className="home-title">
          Ask a scientific question.
          <em>See the data behind the answer.</em>
        </h1>
        <p className="home-lede">
          Search the live catalog, compute a bounded CMS spectrum, or ask how a detector works.
          Counts stay calculated. Interpretations stay labeled.
        </p>
      </header>

      <div className="home-paths">
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
            <p className="home-path-kicker">{path.kicker}</p>
            <p className="home-path-title">{path.title}</p>
            <p className="home-path-hint">{path.hint}</p>
            {path.id === "lab" && (
              <span className="home-path-spark" aria-hidden>
                <span style={{ height: "22%" }} />
                <span style={{ height: "34%" }} />
                <span style={{ height: "52%" }} />
                <span style={{ height: "40%" }} />
                <span style={{ height: "28%" }} />
                <span style={{ height: "64%" }} />
                <span style={{ height: "92%" }} />
                <span style={{ height: "46%" }} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="home-composer" id="beamline-composer">
        <BeamlinePromptInput
          ref={promptInputRef}
          value={composerValue}
          onChange={onComposerChange}
          onSubmit={onSubmitComposer}
          busy={busy}
          placeholder="Ask about a dataset, detector, or analysis…"
        />
        {busy && (
          <p className="composer-busy-hint" role="status" aria-live="polite">
            Searching and reading sources…
          </p>
        )}
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

      <p className="home-help">
        New here?{" "}
        <button type="button" className="text-link" onClick={onOpenHelp}>
          How Beamline works
        </button>
      </p>
    </section>
  );
}
