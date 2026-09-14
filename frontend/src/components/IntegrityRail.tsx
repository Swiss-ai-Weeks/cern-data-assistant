import type { AskResponse } from "../types";
import ScoreGauge from "./ui/ScoreGauge";
import GroundingReceipt from "./GroundingReceipt";

interface Props {
  result: AskResponse;
  onTryGrounded?: (query: string) => void;
}

const RECOVERY = "Why does CMS use a solenoid?";

export default function IntegrityRail({ result, onTryGrounded }: Props) {
  const draft = result.ungrounded_draft?.trim();
  const d = result.guardrail_detail;
  const reason =
    result.guardrail === "retrieval:no_source"
      ? "No authoritative CERN source above the retrieval floor."
      : result.guardrail?.startsWith("input:")
        ? "Request blocked by input safety rail."
        : result.guardrail === "citation:none"
          ? "No valid citations to retrieved passages."
          : result.guardrail === "grounding:unsupported"
            ? "Fact-check flagged unsupported claims."
            : "Beamline could not verify this against CERN evidence.";

  return (
    <div className="integrity-rail">
      {draft && (
        <div className="integrity-draft" aria-label="Ungrounded model output — not authoritative">
          <p className="microlabel">Ungrounded model output</p>
          <p className="draft-text">{draft}</p>
          <p className="answer-meta">
            Not verified · {result.draft_model || "llama3.2"} · not a CERN product answer
          </p>
        </div>
      )}

      <div className="integrity-proven">
        <p className="microlabel">Beamline evidence rail</p>
        <p className="integrity-tagline">
          A language model can write an answer. Beamline only delivers answers CERN evidence can
          support.
        </p>
        <p className="integrity-refusal">{result.answer}</p>

        {d && (
          <ScoreGauge score={d.top_score} floor={d.threshold} label="Retrieval instrument" />
        )}

        <GroundingReceipt result={result} generatedAt={null} compact />
        <p className="integrity-meta">
          Rail ID <code>{result.guardrail ?? "—"}</code>
        </p>
        <p className="integrity-reason">{reason}</p>
        {onTryGrounded && (
          <button
            type="button"
            className="send-btn integrity-recover"
            onClick={() => onTryGrounded(RECOVERY)}
          >
            Try a CERN-grounded question
          </button>
        )}
      </div>
    </div>
  );
}
