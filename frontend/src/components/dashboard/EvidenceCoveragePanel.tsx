import type { AskResponse } from "../../types";
import Panel from "../ui/Panel";

interface Props {
  answer: AskResponse | null;
  live: boolean;
}

export default function EvidenceCoveragePanel({ answer, live }: Props) {
  if (!answer && !live) {
    return (
      <Panel title="Evidence coverage">
        <p className="dash-muted">Run an investigation to see retrieval and citation coverage from real guardrail data.</p>
      </Panel>
    );
  }

  if (live && !answer) {
    return (
      <Panel title="Evidence coverage">
        <p className="dash-muted">Retrieving passages and validating citations…</p>
        <div className="coverage-track indeterminate" aria-hidden />
      </Panel>
    );
  }

  if (!answer) return null;

  const retrieved = answer.sources.length;
  const cited = answer.sources.filter((s) => s.used).length;
  const d = answer.guardrail_detail;
  const floor = d?.threshold;
  const top = d?.top_score;
  const ratio = retrieved > 0 ? cited / retrieved : 0;
  const pct = Math.round(ratio * 100);

  return (
    <Panel title="Evidence coverage">
      <div className="coverage-ring-wrap" role="img" aria-label={`${cited} of ${retrieved} passages cited`}>
        <svg viewBox="0 0 36 36" className="coverage-ring">
          <path
            className="coverage-bg"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className="coverage-fill"
            strokeDasharray={`${pct}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <div className="coverage-center">
          <span className="microlabel">cited</span>
          <span className="tnum coverage-num">
            {cited}/{retrieved}
          </span>
        </div>
      </div>
      <ul className="coverage-list">
        <li>
          <span>Grounding</span>
          <span>{answer.grounded ? "Verified" : "Refused"}</span>
        </li>
        {top != null && floor != null && (
          <li>
            <span>Retrieval</span>
            <span className="tnum">
              {top} / {floor}
            </span>
          </li>
        )}
        <li>
          <span>Citation check</span>
          <span>{answer.guardrail ?? "—"}</span>
        </li>
      </ul>
      <p className="coverage-note">Coverage reflects cited vs retrieved passages only — not physics confidence.</p>
    </Panel>
  );
}
