# Beamline UI/UX design notes

Design pass focused on **CERN Scientific Data Console** personality: control-room precision, editorial science, instrumentation typography, premium research software — not a chatbot.

All data shown remains **real** (health API, SSE timeline, catalog records, citations, guardrail scores). Conceptual collision graphics are explicitly labeled.

---

## Visual system & tokens

**Location:** `frontend/src/styles/tokens.css` (imported from `index.css`).

| Category | Decisions |
|----------|-----------|
| **Foundation** | Paper `#ECEDE8`, bone surfaces, ink `#131410`, cobalt `#3F63C9` as sole active accent |
| **Semantic** | Success (grounded), warning (broadened/low confidence), refusal (guardrail/offline) — no rainbow or neon |
| **Type** | General Sans (UI), Instrument Serif italic (emphasis), IBM Plex Mono (recid, commands, scores, timestamps) |
| **Scale** | `--text-xs` through `--text-display`, spacing on 4px grid, radius sm/md/lg/xl/pill |
| **Elevation** | Hairline borders + restrained shadows (`--shadow-passport` for handoff only) |
| **Motion** | `--duration-fast/normal/slow`, `--ease-out`; **zero duration** under `prefers-reduced-motion` |

Component styles live in `frontend/src/styles/components.css` (timeline, control room, passport, integrity rail, archive drawer, palette).

---

## Key interaction decisions

### 1. Idle / landing (`ControlRoom.tsx`)
- Split **instrument canvas** (left) + **query console** (right); stacks on mobile.
- Mandatory disclosure: *Conceptual collision visualization — not reconstructed event data*.
- Canvas: detector ring animation + conceptual layer labels (Tracker, ECAL, Muon, Solenoid).
- **Status strip** from `/api/health`: catalog, grounding index count, model, evidence floor.
- Promise line + **How it works** flow (Ask → catalog/docs → verification → handoff).
- Link opens trust panel (same content as `?` shortcut).
- Four example chips + demo sequences (real queries only).

### 2. Investigation timeline (`AgentTimeline.tsx`)
- Six stages with pending / active / complete / warning / blocked markers.
- Live mode: subtle vertical **scanner** animation (disabled with reduced motion).
- Staggered reveal of completed steps; elapsed time only where useful (not a “slow” feeling).
- `aria-live="polite"` on the timeline during streaming.

### 3. Research passport (`ResearchPassport.tsx`)
- **Print/boarding layout**: ink stub + barcode + vertical recid; body is structured **meta table** (hairline grid), not pill clutter.
- **Live CERN record** badge only when `health.cern_api === ok` **and** search returned results.
- Variants via banners: broadened search, catalog offline, partial metadata.
- Command block with floating copy control + portal / files / notebook actions.
- Loading: `PassportSkeleton.tsx` (fixed height, no layout jump).
- Empty catalog message on stage when search returns zero hits.

### 4. Evidence brief (`EvidenceBrief.tsx`, `GroundingReceipt.tsx`)
- Readable body type; `[n]` as buttons opening **citation drawer** (title, excerpt, URL, score, kind).
- Note distinguishing cited facts vs synthesis; low-confidence band called out.
- **Evidence map** links sentences to sources.
- Receipt: grid of status, source counts, score vs floor, validation, model, localized timestamp.

### 5. Scientific Integrity Rail (`IntegrityRail.tsx`, `ui/ScoreGauge.tsx`)
- **Desktop:** ungrounded draft **left** (dashed, de-emphasized); evidence rail **right** (authoritative).
- **Mobile:** evidence rail first, draft second (safe answer prioritized).
- **Retrieval instrument** gauge: score vs floor needle.
- Tagline: model can write; Beamline only ships CERN-supported answers.
- Recovery chip to a known grounded question.

### 6. Record archive (`RecordDrawer.tsx`)
- Archive listing: mono table head, zebra rows, formatted sizes.
- Filter when >8 files; sticky footer: copy command, portal, notebook.
- Mobile: full-width bottom sheet styling via CSS.

### 7. Navigation (`Chat.tsx`)
- Thread is **secondary**: compact history header + “New” investigation.
- Primary stage remains right column (or full width before first ask).
- **Command palette:** `Ctrl/Cmd+K` — new investigation, trust flow, shortcut reference.

### 8. Presenter mode
- **Shift+P** (existing hook in `usePresenterMode.ts`).
- Enlarged stage blocks, de-emphasized thread, floating shortcut hint (`1`/`2`/`3`/`?`).
- Demo keys unchanged; no fake data.

---

## Responsive behavior

| Breakpoint | Behavior |
|------------|----------|
| **1440×900** | Control room two-column; passport stub + wide meta grid; integrity side-by-side |
| **≤960px** | Stacked control room; passport stub horizontal; integrity proven-before-draft; drawer as bottom sheet |
| **390px** | Status strip wraps; example chips wrap; no horizontal overflow on tables (scroll inside `compare-table-wrap` / cmd pre) |

---

## Accessibility improvements

- Focus-visible outlines preserved globally.
- Icon-free controls use text labels (“Investigate”, “Copy”, “Close record archive”).
- Timeline and status strip expose `role="status"` / `aria-live` where appropriate.
- Drawers/palette: backdrop button + Escape; dialog roles on archive and trust panels.
- Citation controls are `<button>` elements (keyboard activatable); evidence map ditto.
- Reduced motion disables beam pulse, timeline scan, stage animations.

---

## Presenter & keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **Shift+P** | Presenter mode |
| **?** | Trust flow panel |
| **Ctrl/Cmd+K** | Command palette |
| **1 / 2 / 3** | Demo scenes (presenter on) |
| **Enter** | Submit query |
| **Esc** | Close drawer / palette |

---

## Before / after component map

| Before | After |
|--------|--------|
| `index.css` monolithic `:root` | `tokens.css` + `components.css` |
| Idle: collision + two punch buttons | `ControlRoom` full console + composer |
| `StatusBar` pills only in header | `SystemStatusStrip` on landing + header pills |
| Pipe nodes (`Workbench`) | `AgentTimeline` investigation list |
| `BoardingPass` ticket | `ResearchPassport` handoff layout |
| `AnswerCard` split draft | `IntegrityRail` + `ScoreGauge` |
| Basic `RecordDrawer` list | Archive table + filter + sticky actions |
| Thread-only navigation | Thread head + command palette |
| — | `PassportSkeleton`, `CommandPalette`, `ScoreGauge` primitives |

**Unchanged behavior:** SSE agent stream, API contracts, search/ask/fetch, guardrails, notebook export, compare panel logic, trust content source.

---

## Build verification

```bash
cd frontend && npm run build
```

Production CSS bundle includes token + component layers (~56KB gzip ~11KB).
