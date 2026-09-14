import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { streamAgent } from "../api";
import type { AgentResponse } from "../types";
import AnswerCard from "./AnswerCard";
import ResultsFeed from "./ResultsFeed";
import RecordDrawer from "./RecordDrawer";

const STARTERS = [
  {
    title: "Find collision data",
    query: "proton-proton collisions at 13 TeV with muons",
    hint: "Natural-language dataset search",
  },
  {
    title: "Ask a detector question",
    query: "Why does CMS use a solenoid?",
    hint: "Grounded in CERN sources",
  },
  {
    title: "Do both in one turn",
    query: "find CMS muon datasets and explain why CMS uses a solenoid",
    hint: "Agent plans search + Q&A",
  },
  {
    title: "See a refusal",
    query: "How do black holes evaporate?",
    hint: "No CERN source → no answer",
  },
];

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

export default function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [openRecid, setOpenRecid] = useState<number | string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function send(raw: string) {
    const query = raw.trim();
    if (!query || busy) return;
    setValue("");
    setBusy(true);
    const user: Turn = { id: uid(), role: "user", text: query, steps: [], result: null, error: null, live: false };
    const asst: Turn = { id: uid(), role: "assistant", text: "", steps: [], result: null, error: null, live: true };
    setTurns((prev) => [...prev, user, asst]);
    const hist = historyForApi([...turns, user]);

    try {
      for await (const ev of streamAgent(query, hist)) {
        setTurns((prev) =>
          prev.map((t) => {
            if (t.id !== asst.id) return t;
            if (ev.type === "status") {
              return { ...t, steps: [...t.steps, ev.label] };
            }
            if (ev.type === "plan" && ev.goal) {
              return { ...t, text: ev.goal };
            }
            if (ev.type === "result") {
              return { ...t, result: ev.payload, live: false };
            }
            if (ev.type === "error") {
              return { ...t, error: ev.error, live: false };
            }
            return t;
          }),
        );
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

  const last = [...turns].reverse().find((t) => t.role === "assistant" && t.result);
  const followups = last?.result?.followups ?? [];

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scroller}>
        {turns.length === 0 && (
          <div className="welcome">
            <p className="welcome-kicker">CERN Data Assistant</p>
            <h2>Search open data. Ask about detectors. Stay grounded.</h2>
            <p className="welcome-lead">
              Beamline plans your question, searches{" "}
              <a href="https://opendata.cern.ch" target="_blank" rel="noreferrer">
                opendata.cern.ch
              </a>
              , and answers physics only when a CERN source supports it.
            </p>
            <div className="starter-grid">
              {STARTERS.map((s) => (
                <button
                  key={s.query}
                  type="button"
                  className="starter-card"
                  onClick={() => send(s.query)}
                >
                  <strong>{s.title}</strong>
                  <span>{s.hint}</span>
                  <em>{s.query}</em>
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className={`bubble ${t.role}`}>
            <div className="bubble-who">{t.role === "user" ? "You" : "Beamline"}</div>
            {t.role === "user" && <p className="bubble-text">{t.text}</p>}
            {t.role === "assistant" && (
              <>
                {t.steps.length > 0 && (
                  <ol className="timeline">
                    {t.steps.map((s, i) => (
                      <li key={i} className={t.live && i === t.steps.length - 1 ? "now" : "done"}>
                        {s}
                      </li>
                    ))}
                  </ol>
                )}
                {t.text && !t.result && <p className="bubble-goal">{t.text}</p>}
                {t.error && <div className="error-banner">{t.error}</div>}
                {t.result?.answer && <AnswerCard result={t.result.answer} />}
                {t.result?.search && t.result.search.results.length > 0 && (
                  <ResultsFeed result={t.result.search} onOpenRecord={setOpenRecid} />
                )}
                {t.result &&
                  !t.result.answer &&
                  (!t.result.search || t.result.search.results.length === 0) && (
                    <div className="empty-state">No datasets matched. Try an experiment, particle, or energy.</div>
                  )}
              </>
            )}
          </div>
        ))}
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
          placeholder="Ask for datasets or about a detector… Enter to send, Shift+Enter for a new line"
          disabled={busy}
        />
        <div className="composer-bar">
          {turns.length > 0 && (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setTurns([])}
              disabled={busy}
            >
              New conversation
            </button>
          )}
          <span className="composer-hint">{busy ? "Running tools…" : "Follow-ups stay in this thread"}</span>
          <button className="console-submit" type="submit" disabled={busy || !value.trim()}>
            {busy ? "Working" : "Send"}
          </button>
        </div>
      </form>

      <RecordDrawer recid={openRecid} onClose={() => setOpenRecid(null)} />
    </div>
  );
}
