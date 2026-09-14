import type { AskResponse } from "../../types";
import Panel from "../ui/Panel";
import LogoMark from "../LogoMark";

interface Props {
  answer: AskResponse | null;
  onOpenEvidence: () => void;
  onTryGrounded?: () => void;
}

export default function ResearchBriefPanel({ answer, onOpenEvidence, onTryGrounded }: Props) {
  if (!answer) {
    return (
      <Panel title="Research brief" className="dash-span-2">
        <div className="brief-empty">
          <LogoMark className="brief-logo" />
          <p className="brief-lead">
            Detector and documentation answers appear here with citations —{" "}
            <span className="serif-accent">only when CERN sources support them.</span>
          </p>
        </div>
      </Panel>
    );
  }

  if (!answer.grounded) {
    return (
      <Panel title="Research brief" className="dash-span-2">
        <p className="brief-refuse">{answer.answer}</p>
        <p className="dash-muted tnum">Rail: {answer.guardrail ?? "—"}</p>
        {onTryGrounded && (
          <button type="button" className="btn-primary brief-cta" onClick={onTryGrounded}>
            Try a CERN-grounded question
          </button>
        )}
      </Panel>
    );
  }

  const cited = answer.sources.filter((s) => s.used).length;
  const preview = answer.answer.slice(0, 280) + (answer.answer.length > 280 ? "…" : "");

  return (
    <Panel title="Research brief" className="dash-span-2">
      <p className="brief-preview">{preview}</p>
      <p className="dash-muted tnum">
        {cited} cited source{cited === 1 ? "" : "s"} · {answer.guardrail}
      </p>
      <button type="button" className="btn-primary brief-cta" onClick={onOpenEvidence}>
        Open evidence brief
      </button>
    </Panel>
  );
}
