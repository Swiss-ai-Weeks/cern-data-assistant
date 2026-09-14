import type { AskResponse } from "../types";
import ScoreGauge from "./ui/ScoreGauge";
import GroundingReceipt from "./GroundingReceipt";

interface Props {
  result: AskResponse;
  onTryGrounded?: (query: string) => void;
}

const RECOVERY = "Why does CMS use a solenoid?";

function reasonCopy(result: AskResponse): { title: string; body: string } {
  if (result.guardrail === "retrieval:no_source") {
    return {
      title: "No CERN source above the evidence floor",
      body: "The index had nothing close enough to this question. Beamline did not let the model invent an answer.",
    };
  }
  if (result.guardrail?.startsWith("input:")) {
    return {
      title: "Outside the CERN Open Data brief",
      body: "This request was stopped before retrieval. Ask about datasets, collisions, or documented detectors.",
    };
  }
  if (result.guardrail === "citation:none") {
    return {
      title: "No valid citations",
      body: "The model could not attach its claims to retrieved CERN passages, so nothing was released.",
    };
  }
  if (result.guardrail === "grounding:unsupported") {
    return {
      title: "Claims not supported by the sources",
      body: "A fact-check found statements the retrieved CERN text does not back. Those claims were not published.",
    };
  }
  return {
    title: "Not verified against CERN evidence",
    body: "Beamline only ships an answer when indexed CERN documentation can support it.",
  };
}

export default function IntegrityRail({ result, onTryGrounded }: Props) {
  const draft = result.ungrounded_draft?.trim();
  const d = result.guardrail_detail;
  const copy = reasonCopy(result);

  return (
    <div className="integrity-rail">
      {draft && (
        <div className="integrity-draft" aria-label="Ungrounded model output — not authoritative">
          <p className="microlabel">What the model wanted to say</p>
          <p className="integrity-draft-kicker">Not a Beamline answer · not from CERN sources</p>
          <p className="draft-text">{draft}</p>
        </div>
      )}

      <div className="integrity-proven">
        <p className="microlabel">Held back</p>
        <h3 className="integrity-title">{copy.title}</h3>
        <p className="integrity-reason">{copy.body}</p>
        <p className="integrity-refusal">{result.answer}</p>

        {d && <ScoreGauge score={d.top_score} floor={d.threshold} label="Closest retrieval" />}

        <GroundingReceipt result={result} generatedAt={null} compact />

        {onTryGrounded && (
          <button type="button" className="send-btn integrity-recover" onClick={() => onTryGrounded(RECOVERY)}>
            Try a CERN-grounded question
          </button>
        )}
      </div>
    </div>
  );
}
