import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { streamAgent, type AgentStreamEvent } from "../api";
import type { AgentResponse } from "../types";
import Workbench from "./Workbench";
import RecordDrawer from "./RecordDrawer";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps: string[];
  result: AgentResponse | null;
  error: string | null;
  live: boolean;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function historyForApi(turns: Turn[]): { role: string; content: string }[] {
  const out: { role: string; content: string }[] = [];
  for (const t of turns) {
    if (t.role === "user") out.push({ role: "user", content: t.text });
    if (t.role === "assistant" && t.result?.answer?.answer) {
      out.push({ role: "assistant", content: t.result.answer.answer.slice(0, 400) });
    } else if (t.role === "assistant" && t.result?.search?.search_terms) {
      out.push({
        role: "assistant",
        content: `Found datasets for: ${t.result.search.search_terms}`,
      });
    }
  }
  return out.slice(-6);
}

function blankResult(query: string): AgentResponse {
  return { query, goal: query, tools_used: [], search: null, answer: null, picked: null };
}

function applyEvent(t: Turn, ev: AgentStreamEvent, query: string): Turn {
  if (ev.type === "status") return { ...t, steps: [...t.steps, ev.label] };
  if (ev.type === "plan" && ev.goal) return { ...t, text: ev.goal };
  if (ev.type === "error") return { ...t, error: ev.error, live: false };
  if (ev.type === "result") return { ...t, result: ev.payload, live: false };
  if (ev.type === "tool_done") {
    const prev = t.result ?? blankResult(query);
    const tools = prev.tools_used.includes(ev.tool) ? prev.tools_used : [...prev.tools_used, ev.tool];
    return {
      ...t,
      result: {
        ...prev,
        tools_used: tools,
        search: ev.search !== undefined ? ev.search : prev.search,
        answer: ev.answer !== undefined ? ev.answer : prev.answer,
        picked: ev.picked !== undefined ? ev.picked : prev.picked,
      },
    };
  }
  return t;
}

export default function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [openRecid, setOpenRecid] = useState<number | string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const lastAsst = [...turns].reverse().find((t) => t.role === "assistant") ?? null;
  const stageAsst = turns.find((t) => t.id === focusId && t.role === "assistant") ?? lastAsst;

  function focusTurn(t: Turn) {
    if (t.role === "assistant") {
      setFocusId(t.id);
      return;
    }
    const i = turns.findIndex((x) => x.id === t.id);
    const next = turns.slice(i + 1).find((x) => x.role === "assistant");
    if (next) setFocusId(next.id);
  }

  async function send(raw: string) {
    const query = raw.trim();
    if (!query || busy) return;
    setValue("");
    setBusy(true);
    const user: Turn = { id: uid(), role: "user", text: query, steps: [], result: null, error: null, live: false };
    const asst: Turn = { id: uid(), role: "assistant", text: "", steps: [], result: null, error: null, live: true };
    setFocusId(asst.id);
    setTurns((prev) => [...prev, user, asst]);
    const hist = historyForApi([...turns, user]);

    try {
      for await (const ev of streamAgent(query, hist)) {
        setTurns((prev) => prev.map((t) => (t.id === asst.id ? applyEvent(t, ev, query) : t)));
      }
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === asst.id
            ? { ...t, live: false, error: err instanceof Error ? err.message : "Request failed." }
            : t,
        ),
      );
    } finally {
      setBusy(false);
      setTurns((prev) => prev.map((t) => (t.id === asst.id ? { ...t, live: false } : t)));
      box.current?.focus();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(value);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(value);
    }
  }

  const followups = stageAsst?.result?.followups ?? [];

  return (
    <div className={`cockpit-body ${turns.length === 0 ? "stage-first" : ""}`}>
      <aside className="thread">
        <div className="thread-scroll" ref={scroller}>
          {turns.length === 0 && (
            <p className="thread-empty">
              Ask anything. Results land <em>on the right.</em>
            </p>
          )}
          {turns.map((t) => {
            const onStage =
              t.id === stageAsst?.id ||
              (t.role === "user" &&
                turns[turns.findIndex((x) => x.id === t.id) + 1]?.id === stageAsst?.id);
            return (
              <button
                key={t.id}
                type="button"
                className={`msg ${t.role} ${onStage ? "on-stage" : ""}`}
                onClick={() => focusTurn(t)}
              >
                <div className="msg-who">{t.role === "user" ? "You" : "Beamline"}</div>
                {t.role === "user" ? (
                  <p>{t.text}</p>
                ) : (
                  <p className="msg-asst">
                    {t.live
                      ? t.steps[t.steps.length - 1] || "Planning…"
                      : t.result?.answer?.answer
                        ? t.result.answer.answer.slice(0, 160) + (t.result.answer.answer.length > 160 ? "…" : "")
                        : t.result?.search
                          ? `${t.result.search.returned} datasets · ${t.result.search.search_terms}`
                          : t.error || t.text || "Done."}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {followups.length > 0 && !busy && (
          <div className="followups">
            {followups.map((q) => (
              <button key={q} type="button" className="follow-chip" onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}

        <form className="composer" onSubmit={onSubmit}>
          <textarea
            ref={box}
            className="composer-input"
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            placeholder="ask in plain English"
            disabled={busy}
            autoFocus
          />
          <div className="composer-bar">
            {turns.length > 0 && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setTurns([]);
                  setFocusId(null);
                }}
                disabled={busy}
              >
                Reset
              </button>
            )}
            <span className="composer-hint">{busy ? "working" : "enter ↵"}</span>
            <button className="send-btn" type="submit" disabled={busy || !value.trim()}>
              {busy ? "…" : "Ask"}
            </button>
          </div>
        </form>
      </aside>

      <Workbench
        idle={turns.length === 0}
        live={
          stageAsst
            ? {
                steps: stageAsst.steps,
                text: stageAsst.text,
                result: stageAsst.result,
                live: stageAsst.live,
                error: stageAsst.error,
              }
            : null
        }
        onStarter={send}
        onOpenRecord={setOpenRecid}
      />

      <RecordDrawer recid={openRecid} onClose={() => setOpenRecid(null)} />
    </div>
  );
}
