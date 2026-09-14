import type { AskResponse } from "../types";
import EvidenceBrief from "./EvidenceBrief";

interface Props {
  result: AskResponse;
  query?: string;
  onTryGrounded?: (q: string) => void;
  generatedAt?: string | null;
}

/** @deprecated import EvidenceBrief directly — kept for legacy panel imports */
export default function AnswerCard({ result, query = "", onTryGrounded, generatedAt }: Props) {
  return (
    <div className="answer-card answer-card-beamline">
      <EvidenceBrief
        result={result}
        query={query}
        onTryGrounded={onTryGrounded}
        generatedAt={generatedAt}
      />
    </div>
  );
}
