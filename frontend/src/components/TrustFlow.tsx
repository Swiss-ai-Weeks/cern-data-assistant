import { useRef } from "react";
import { useOverlayA11y } from "../hooks/useOverlayA11y";
import { usePresence } from "../hooks/usePresence";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TrustFlow({ open, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const { shown, motion } = usePresence(open);
  useOverlayA11y(open, onClose, panelRef);

  if (!shown) return null;

  return (
    <div className="trust-root overlay-shell" data-motion={motion}>
      <button type="button" className="drawer-backdrop" aria-label="Close" onClick={onClose} />
      <aside ref={panelRef} className="trust-panel" role="dialog" aria-modal="true" aria-labelledby="trust-title">
        <header className="trust-head">
          <h2 id="trust-title">How Beamline earns trust</h2>
          <button type="button" className="drawer-close" onClick={onClose}>
            Close
          </button>
        </header>
        <ol className="trust-steps">
          <li>
            <strong>English intent</strong>
            <span>A planner decides whether to search the live catalog, query CERN docs, or both.</span>
          </li>
          <li>
            <strong>CERN catalog &amp; documents</strong>
            <span>Real HTTP calls to opendata.cern.ch plus a local index of portal pages and glossary.</span>
          </li>
          <li>
            <strong>Evidence checks</strong>
            <span>Retrieval floor, citation validation, and a second-pass fact-check before anything ships.</span>
          </li>
          <li>
            <strong>Research handoff</strong>
            <span>recid, DOI, files, download command, notebook export — or a sourced answer with receipts.</span>
          </li>
        </ol>
        <p className="trust-foot">
          If CERN did not support it, Beamline does not claim it. Press <kbd>?</kbd> anytime to reopen.
        </p>
      </aside>
    </div>
  );
}
