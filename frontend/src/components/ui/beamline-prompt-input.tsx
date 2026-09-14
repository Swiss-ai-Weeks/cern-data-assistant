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
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5"
        stroke="currentColor"
        strokeWidth="1.75"
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
      el.style.height = "auto";
      const next = Math.min(Math.max(el.scrollHeight, 22), 120);
      el.style.height = `${next}px`;
    }, [value]);

    const submit = () => {
      if (busy || !hasValue) return;
      onSubmit();
    };

    return (
      <div className={cn("prompt-root", className)}>
        <div className="prompt-card prompt-card-single">
          <textarea
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
          <button
            type="button"
            className={cn("prompt-send prompt-send-inline", hasValue && "prompt-send-ready")}
            onClick={submit}
            disabled={busy || !hasValue}
            aria-label={busy ? "Working" : "Send query"}
          >
            {busy ? <span className="prompt-dots" aria-hidden /> : <ArrowUpIcon />}
          </button>
        </div>
      </div>
    );
  },
);
