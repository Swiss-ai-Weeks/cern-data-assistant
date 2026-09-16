import type { Ref } from "react";
import type { HealthResponse } from "../../types";
import {
  BeamlinePromptInput,
  type BeamlinePromptInputHandle,
} from "../ui/beamline-prompt-input";

interface Props {
  health: HealthResponse | null;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder?: string;
  promptInputRef?: Ref<BeamlinePromptInputHandle>;
  compact?: boolean;
}

export default function BeamlineComposerStrip({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder = "Ask about a dataset, detector, or analysis…",
  promptInputRef,
  compact = false,
}: Props) {
  return (
    <div className={`beamline-sticky-composer ${compact ? "beamline-sticky-composer-compact" : ""}`}>
      <div className="simple-chat-input-wrap">
        <BeamlinePromptInput
          ref={promptInputRef}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          busy={busy}
          placeholder={placeholder}
        />
      </div>
      {busy && (
        <p className="composer-busy-hint" role="status" aria-live="polite">
          Searching and reading sources…
        </p>
      )}
    </div>
  );
}
