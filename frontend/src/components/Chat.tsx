import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearInvestigationSession,
  loadInvestigationSession,
  saveInvestigationSession,
  type SessionTurn,
} from "../lib/investigationSession";
import type { ThreadItem } from "./chat/SessionThread";
import type { BeamlinePromptInputHandle } from "./ui/beamline-prompt-input";
import { streamAgent, type AgentStreamEvent } from "../api";
import type { AgentResponse, HealthResponse } from "../types";
import DashboardShell, { type DashTab } from "../layouts/DashboardShell";
import CommandPalette from "./CommandPalette";
import HistoryDrawer from "./HistoryDrawer";
import InvestigateDashboard from "./dashboard/InvestigateDashboard";
import RecordDrawer from "./RecordDrawer";
import AppFooter from "./ui/AppFooter";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps: string[];
  events: AgentStreamEvent[];
  result: AgentResponse | null;
  error: string | null;
  live: boolean;
  generatedAt: string | null;
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

function hydrateTurn(st: SessionTurn): Turn {
  return {
    ...st,
    events: [],
    live: false,
  };
}

function toSessionTurn(t: Turn): SessionTurn {
  return {
    id: t.id,
    role: t.role,
    text: t.text,
    steps: t.steps,
    result: t.result,
    error: t.error,
    generatedAt: t.generatedAt,
  };
}

function applyEvent(t: Turn, ev: AgentStreamEvent, query: string): Turn {
  const events = [...t.events, ev];
  if (ev.type === "status") return { ...t, events, steps: [...t.steps, ev.label] };
  if (ev.type === "plan" && ev.goal) return { ...t, events, text: ev.goal };
  if (ev.type === "error") return { ...t, events, error: ev.error, live: false };
  if (ev.type === "result") {
    return {
      ...t,
      events,
      result: ev.payload,
      live: false,
      generatedAt: t.generatedAt ?? new Date().toISOString(),
    };
  }
  if (ev.type === "tool_done") {
    const prev = t.result ?? blankResult(query);
    const tools = prev.tools_used.includes(ev.tool) ? prev.tools_used : [...prev.tools_used, ev.tool];
    return {
      ...t,
      events,
      result: {
        ...prev,
        tools_used: tools,
        search: ev.search !== undefined ? ev.search : prev.search,
        answer: ev.answer !== undefined ? ev.answer : prev.answer,
        picked: ev.picked !== undefined ? ev.picked : prev.picked,
      },
    };
  }
  return { ...t, events };
}

interface ChatProps {
  health: HealthResponse | null;
  helpOpen: boolean;
  onOpenHelp: () => void;
  onCloseHelp: () => void;
  onOpenTrust: () => void;
}

export default function Chat({ health, helpOpen, onOpenHelp, onCloseHelp, onOpenTrust }: ChatProps) {
  const [turns, setTurns] = useState<Turn[]>(() => {
    const saved = loadInvestigationSession();
    if (!saved) return [];
    return saved.map(hydrateTurn);
  });
  const [value, setValue] = useState("");
  const promptRef = useRef<BeamlinePromptInputHandle>(null);
  const [busy, setBusy] = useState(false);
  const [openRecid, setOpenRecid] = useState<number | string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(() => {
    const saved = loadInvestigationSession();
    if (!saved) return null;
    const last = [...saved].reverse().find((t) => t.role === "assistant");
    return last?.id ?? null;
  });
  const [activeTab, setActiveTab] = useState<DashTab>("investigate");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length === 0) {
      clearInvestigationSession();
      return;
    }
    saveInvestigationSession(turns.map(toSessionTurn));
  }, [turns]);

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
    setHistoryOpen(false);
    onCloseHelp();
    setActiveTab("investigate");
    const user: Turn = {
      id: uid(),
      role: "user",
      text: query,
      steps: [],
      events: [],
      result: null,
      error: null,
      live: false,
      generatedAt: null,
    };
    const asst: Turn = {
      id: uid(),
      role: "assistant",
      text: "",
      steps: [],
      events: [],
      result: null,
      error: null,
      live: true,
      generatedAt: null,
    };
    setTurns((prev) => [...prev, user, asst]);
    setFocusId(asst.id);

    try {
      for await (const ev of streamAgent(query, historyForApi([...turns, user]))) {
        setTurns((prev) =>
          prev.map((t) => (t.id === asst.id ? applyEvent(t, ev, query) : t)),
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
    }
  }

  function newInvestigation() {
    if (busy) return;
    if (turns.length > 0 && !window.confirm("Start a new investigation? This clears the current session.")) {
      return;
    }
    setTurns([]);
    setFocusId(null);
    setValue("");
    setActiveTab("investigate");
    setHistoryOpen(false);
    clearInvestigationSession();
  }

  const followups = stageAsst?.result?.followups ?? [];
  const stageUser =
    stageAsst &&
    turns[Math.max(0, turns.findIndex((t) => t.id === stageAsst.id) - 1)];
  const stageQuery = stageUser?.role === "user" ? stageUser.text : stageAsst?.result?.query ?? "";

  const threadItems = useMemo((): ThreadItem[] => {
    const items: ThreadItem[] = [];
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (t.role !== "user") continue;
      const next = turns[i + 1];
      items.push({
        userId: t.id,
        asstId: next?.role === "assistant" ? next.id : null,
        label: t.text,
      });
    }
    return items;
  }, [turns]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submitComposer() {
    const q = value.trim();
    if (q) void send(q);
  }

  function focusComposer() {
    setActiveTab("investigate");
    setHistoryOpen(false);
    onCloseHelp();
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  function openHelp() {
    setHistoryOpen(false);
    onOpenHelp();
  }

  return (
    <>
      <DashboardShell
        activeTab={activeTab}
        onTabChange={(tab) => {
          setHistoryOpen(false);
          onCloseHelp();
          setActiveTab(tab);
        }}
        onNewInvestigation={newInvestigation}
        onToggleHistory={() => {
          onCloseHelp();
          setHistoryOpen((v) => !v);
        }}
        historyOpen={historyOpen}
        onFocusComposer={focusComposer}
        onOpenHelp={openHelp}
        helpOpen={helpOpen}
      >
        <InvestigateDashboard
          promptInputRef={promptRef}
          followups={followups}
          activeTab={activeTab}
          health={health}
          query={stageQuery}
          composerValue={value}
          onComposerChange={setValue}
          onSubmitComposer={submitComposer}
          busy={busy}
          idle={turns.length === 0}
          onOpenHelp={openHelp}
          onOpenTrust={onOpenTrust}
          live={
            stageAsst
              ? {
                  steps: stageAsst.steps,
                  text: stageAsst.text,
                  result: stageAsst.result,
                  live: stageAsst.live,
                  error: stageAsst.error,
                  events: stageAsst.events,
                  generatedAt: stageAsst.generatedAt,
                }
              : null
          }
          onStarter={send}
          onOpenRecord={setOpenRecid}
          onFocusEvidence={() => setActiveTab("evidence")}
          threadItems={threadItems}
          activeAsstId={stageAsst?.id ?? null}
          onSelectThread={(id) => {
            setFocusId(id);
            setActiveTab("investigate");
          }}
        />
        <AppFooter onOpenHelp={openHelp} onOpenTrust={onOpenTrust} />
      </DashboardShell>

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        turns={turns}
        stageAsstId={stageAsst?.id ?? null}
        onFocusTurn={(id) => {
          const t = turns.find((x) => x.id === id);
          if (t) focusTurn(t);
        }}
        followups={followups}
        busy={busy}
        onFollowup={send}
        value={value}
        onValueChange={setValue}
        onSubmit={submitComposer}
        scroller={scroller}
      />

      <RecordDrawer recid={openRecid} onClose={() => setOpenRecid(null)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNewInvestigation={newInvestigation}
        onOpenTrust={onOpenTrust}
        onOpenHelp={openHelp}
        onOpenAbout={() => {
          setHistoryOpen(false);
          onCloseHelp();
          setActiveTab("about");
        }}
      />
    </>
  );
}
