import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { cn } from "../../lib/utils";

export interface BeamlinePromptInputHandle {
  focus: () => void;
}

export interface BeamlinePromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  busy?: boolean;
  className?: string;
}

function ArrowUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 19V5M12 5L5 12M12 5l7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const BeamlinePromptInput = forwardRef<BeamlinePromptInputHandle, BeamlinePromptInputProps>(
  function BeamlinePromptInput(
    {
      value,
      onChange,
      onSubmit,
      placeholder = "Ask in plain English…",
      busy = false,
      className,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hasValue = value.trim().length > 0;

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "0px";
      const next = Math.min(Math.max(el.scrollHeight, 24), 120);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > 120 ? "auto" : "hidden";
    }, [value]);

    const submit = () => {
      if (busy || !hasValue) return;
      onSubmit();
    };

    return (
      <div className={cn("prompt-root", className)}>
        <div
          className="prompt-card prompt-card-single"
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target === e.currentTarget || !target.closest("button, textarea")) {
              textareaRef.current?.focus();
            }
          }}
        >
          <textarea
            id="beamline-query"
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            disabled={busy}
            aria-label="Scientific query"
            rows={1}
            className="prompt-textarea prompt-textarea-single"
          />
          <div className="prompt-toolbar">
            <p className="prompt-hint">
              {busy ? "Working…" : hasValue ? "Enter to send" : "Shift+Enter for a new line"}
            </p>
            <button
              type="button"
              className={cn("prompt-send prompt-send-inline", (hasValue || busy) && "prompt-send-ready")}
              onClick={submit}
              disabled={busy || !hasValue}
              aria-label={busy ? "Working" : "Send query"}
            >
              {busy ? <span className="prompt-dots" aria-hidden /> : <ArrowUpIcon />}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
