import { useRef } from "react";
import { useOverlayA11y } from "../hooks/useOverlayA11y";
import { usePresence } from "../hooks/usePresence";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function HelpSheet({ open, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const { shown, motion } = usePresence(open);
  useOverlayA11y(open, onClose, panelRef);

  if (!shown) return null;

  return (
    <div className="help-root overlay-shell" data-motion={motion}>
      <button type="button" className="drawer-backdrop" aria-label="Close help" onClick={onClose} />
      <aside
        ref={panelRef}
        className="help-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <header className="help-head">
          <h2 id="help-title">Help</h2>
          <button type="button" className="drawer-close" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="help-body">
          <section>
            <h3 className="help-section-title">What Beamline does</h3>
            <p>
              Beamline connects plain English to the{" "}
              <a href="https://opendata.cern.ch" target="_blank" rel="noreferrer">
                CERN Open Data
              </a>{" "}
              catalog and to a curated index of CERN documentation. It returns either a{" "}
              <strong>dataset you can download</strong>, a <strong>cited answer</strong> from those sources, or a{" "}
              <strong>clear refusal</strong> when nothing authoritative supports the claim.
            </p>
          </section>

          <section>
            <h3 className="help-section-title">How to ask</h3>
            <ul className="help-list">
              <li>
                <strong>Datasets &amp; collisions</strong> — mention energy, detector, or physics channel (e.g. muons at
                13 TeV).
              </li>
              <li>
                <strong>Detector questions</strong> — ask how CMS, ATLAS, or LHC equipment works; answers include{" "}
                <code>[n]</code> citations.
              </li>
              <li>
                <strong>Follow-ups</strong> — use suggested chips or ask again; recent turns inform the planner.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="help-section-title">After you send</h3>
            <ul className="help-list">
              <li>
                <strong>Dataset handoff</strong> — recid, metadata, download command, portal link, optional file
                inspector.
              </li>
              <li>
                <strong>Grounded answer</strong> — text with citations; open a citation to see the source passage.
              </li>
              <li>
                <strong>Not grounded</strong> — explanation of why Beamline withheld an answer; unverified model text
                may be shown separately for transparency.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="help-section-title">Navigation</h3>
            <ul className="help-list help-shortcuts">
              <li>
                <span>Home</span> — main search and results
              </li>
              <li>
                <span>New</span> — start a fresh thread
              </li>
              <li>
                <span>Datasets</span> — catalog matches for the current investigation
              </li>
              <li>
                <span>Search</span> — focus the query field
              </li>
              <li>
                <span>History</span> — previous questions in this session
              </li>
              <li>
                <span>Help</span> — this panel
              </li>
            </ul>
          </section>

          <section>
            <h3 className="help-section-title">Keyboard</h3>
            <ul className="help-kbd-list">
              <li>
                <kbd>Enter</kbd> Send query
              </li>
              <li>
                <kbd>Shift</kbd>+<kbd>Enter</kbd> New line in query
              </li>
              <li>
                <kbd>Ctrl</kbd>+<kbd>K</kbd> Command menu
              </li>
              <li>
                <kbd>?</kbd> Trust &amp; safety
              </li>
              <li>
                <kbd>Esc</kbd> Close panels
              </li>
            </ul>
          </section>

          <section>
            <h3 className="help-section-title">Status bar</h3>
            <p>
              <strong>Catalog</strong> — live connection to opendata.cern.ch. <strong>Model</strong> — local LLM used
              for planning and answers. <strong>Sources</strong> — size of the on-server documentation index. Search can
              work when the model is offline; grounded answers cannot.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
