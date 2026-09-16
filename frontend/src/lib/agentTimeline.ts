import type { AgentStreamEvent } from "../api";

export type TimelineStageId =
  | "interpret_intent"
  | "search_catalog"
  | "rank_records"
  | "retrieve_docs"
  | "verify_grounding"
  | "prepare_handoff";

export type TimelineStageState = "pending" | "active" | "complete" | "warning" | "blocked";

export interface TimelineStage {
  id: TimelineStageId;
  label: string;
  state: TimelineStageState;
  detail?: string;
  elapsedMs?: number;
}

const STAGE_DEFS: { id: TimelineStageId; label: string }[] = [
  { id: "interpret_intent", label: "Interpret scientific intent" },
  { id: "search_catalog", label: "Search CERN Open Data catalog" },
  { id: "rank_records", label: "Rank matching records" },
  { id: "retrieve_docs", label: "Retrieve supporting CERN documentation" },
  { id: "verify_grounding", label: "Verify grounding and citations" },
  { id: "prepare_handoff", label: "Prepare research handoff" },
];

function metaDetail(ev: AgentStreamEvent): string | undefined {
  if (ev.type === "tool_done" && ev.meta) {
    const m = ev.meta;
    if (ev.tool === "search") {
      const parts: string[] = [];
      if (m.total_matches != null) parts.push(`${Number(m.total_matches).toLocaleString()} catalog hits`);
      if (m.returned != null) parts.push(`${m.returned} surfaced`);
      if (m.broadened) parts.push("broadened search");
      if (m.llm_ranked) parts.push("LLM ranked");
      return parts.join(" · ") || undefined;
    }
    if (ev.tool === "ask") {
      const parts: string[] = [];
      if (m.sources_retrieved != null) parts.push(`${m.sources_retrieved} passages`);
      if (m.sources_cited != null) parts.push(`${m.sources_cited} cited`);
      if (m.top_score != null && m.threshold != null) {
        parts.push(`best ${m.top_score} / floor ${m.threshold}`);
      }
      if (m.guardrail) parts.push(String(m.guardrail));
      return parts.join(" · ") || undefined;
    }
    if (ev.tool === "fetch_record" && m.file_count != null) {
      return `${m.file_count} files attached`;
    }
    if (ev.tool === "investigation") {
      const parts: string[] = [];
      if (m.run_id) parts.push(`run ${String(m.run_id).slice(0, 8)}…`);
      if (m.claims != null) parts.push(`${m.claims} claims`);
      return parts.join(" · ") || "Computed dimuon spectrum";
    }
  }
  if (ev.type === "status") return ev.label;
  if (ev.type === "plan" && ev.goal) return ev.goal;
  return undefined;
}

export function buildTimeline(
  events: AgentStreamEvent[],
  live: boolean,
  error: string | null,
  answerGrounded: boolean | null,
): TimelineStage[] {
  const byId = new Map<TimelineStageId, TimelineStage>();
  for (const def of STAGE_DEFS) {
    byId.set(def.id, { id: def.id, label: def.label, state: "pending" });
  }

  let lastStage: TimelineStageId | null = null;
  let lastElapsed = 0;

  for (const ev of events) {
    if ("elapsed_ms" in ev && typeof ev.elapsed_ms === "number") {
      lastElapsed = ev.elapsed_ms;
    }
    const stageId =
      "timeline_stage" in ev && ev.timeline_stage
        ? (ev.timeline_stage as TimelineStageId)
        : ev.type === "plan"
          ? "interpret_intent"
          : null;
    if (!stageId || !byId.has(stageId)) continue;

    const st = byId.get(stageId)!;
    if (ev.type === "status") {
      st.state = "active";
      st.detail = metaDetail(ev);
      st.elapsedMs = lastElapsed;
      lastStage = stageId;
    }
    if (ev.type === "tool_done") {
      st.state = "complete";
      st.detail = metaDetail(ev);
      st.elapsedMs = lastElapsed;
      if (ev.tool === "ask" && ev.grounded === false) {
        st.state = "warning";
      }
      lastStage = stageId;
    }
    if (ev.type === "plan") {
      const intent = byId.get("interpret_intent")!;
      intent.state = "complete";
      intent.detail = ev.goal || undefined;
      intent.elapsedMs = lastElapsed;
    }
  }

  if (live && lastStage) {
    const active = byId.get(lastStage);
    if (active && active.state === "active") {
      /* keep */
    } else {
      const next = STAGE_DEFS.find((s) => byId.get(s.id)?.state === "pending");
      if (next) byId.get(next.id)!.state = "active";
    }
  }

  if (error) {
    const fail = lastStage ? byId.get(lastStage) : byId.get("interpret_intent");
    if (fail) fail.state = "blocked";
  }

  if (answerGrounded === false && byId.get("verify_grounding")) {
    byId.get("verify_grounding")!.state = "warning";
  }

  // Skip stages that never ran (search-only or ask-only turns)
  const investigationRan = events.some((e) => e.type === "tool_done" && e.tool === "investigation");
  const searchRan = events.some((e) => e.type === "tool_done" && e.tool === "search");
  const askRan = events.some((e) => e.type === "tool_done" && e.tool === "ask");
  const fetchRan = events.some((e) => e.type === "tool_done" && e.tool === "fetch_record");
  if (investigationRan) {
    byId.get("search_catalog")!.state = "pending";
    byId.get("rank_records")!.state = "pending";
    byId.get("retrieve_docs")!.state = "pending";
    byId.get("prepare_handoff")!.state = "pending";
    const verify = byId.get("verify_grounding")!;
    verify.state = "complete";
    verify.label = "Computed investigation claims";
  }
  if (!searchRan) {
    byId.get("search_catalog")!.state = "pending";
    byId.get("rank_records")!.state = "pending";
    byId.get("prepare_handoff")!.state = "pending";
  }
  if (!askRan) {
    byId.get("retrieve_docs")!.state = "pending";
    byId.get("verify_grounding")!.state = "pending";
  }
  if (!fetchRan && searchRan) {
    byId.get("prepare_handoff")!.state = "pending";
  }

  return STAGE_DEFS.map((d) => byId.get(d.id)!);
}
