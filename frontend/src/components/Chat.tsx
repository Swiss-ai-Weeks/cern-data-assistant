import { useEffect, useRef, useState } from "react";
import type { BeamlinePromptInputHandle } from "./ui/beamline-prompt-input";
import { streamAgent, type AgentStreamEvent } from "../api";
import type { AgentResponse, HealthResponse } from "../types";
import { DEMO_SCENES, type DemoScene } from "../lib/demoQueries";
import DashboardShell, { type DashTab } from "../layouts/DashboardShell";
import CommandPalette from "./CommandPalette";
import HistoryDrawer from "./HistoryDrawer";
import InvestigateDashboard from "./dashboard/InvestigateDashboard";
import RecordDrawer from "./RecordDrawer";

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
  presenterOn: boolean;
  onOpenTrust: () => void;
}

export default function Chat({ health, presenterOn, onOpenTrust }: ChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [value, setValue] = useState("");
  const promptRef = useRef<BeamlinePromptInputHandle>(null);
  const [busy, setBusy] = useState(false);
  const [openRecid, setOpenRecid] = useState<number | string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashTab>("investigate");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

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
    }
  }

  function newInvestigation() {
    setTurns([]);
    setFocusId(null);
    setValue("");
    setActiveTab("investigate");
  }

  const followups = stageAsst?.result?.followups ?? [];
  const stageUser =
    stageAsst &&
    turns[Math.max(0, turns.findIndex((t) => t.id === stageAsst.id) - 1)];
  const stageQuery = stageUser?.role === "user" ? stageUser.text : stageAsst?.result?.query ?? "";

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

  useEffect(() => {
    if (!presenterOn) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, DemoScene> = { "1": "discovery", "2": "grounded", "3": "integrity" };
      const scene = map[e.key];
      if (!scene) return;
      e.preventDefault();
      void send(DEMO_SCENES[scene].queries[0]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenterOn, busy]);

  function submitComposer() {
    const q = value.trim();
    if (q) void send(q);
  }

  function focusComposer() {
    setActiveTab("investigate");
    setHistoryOpen(false);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  return (
    <>
      <DashboardShell
        activeTab={activeTab}
        onTabChange={(tab) => {
          setHistoryOpen(false);
          setActiveTab(tab);
        }}
        onNewInvestigation={newInvestigation}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
        historyOpen={historyOpen}
        onFocusComposer={focusComposer}
      >
        <InvestigateDashboard
          promptInputRef={promptRef}
          activeTab={activeTab}
          health={health}
          query={stageQuery}
          composerValue={value}
          onComposerChange={setValue}
          onSubmitComposer={submitComposer}
          busy={busy}
          idle={turns.length === 0}
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
        />
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
        onOpenAbout={() => {
          setHistoryOpen(false);
          setActiveTab("about");
        }}
      />
    </>
  );
}
