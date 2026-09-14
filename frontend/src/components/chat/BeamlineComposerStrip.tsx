import type { Ref } from "react";
import type { HealthResponse } from "../../types";
import BeamlineStatusStrip from "../ui/BeamlineStatusStrip";
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
  health,
  value,
  onChange,
  onSubmit,
  busy,
  placeholder = "Ask about CERN datasets or detectors…",
  promptInputRef,
  compact = false,
}: Props) {
  return (
    <>
      {!compact && <BeamlineStatusStrip health={health} />}
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
            Beamline is working on your question…
          </p>
        )}
      </div>
    </>
  );
}
