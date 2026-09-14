# Beamline — product specification (hosted)

**Beamline** is a hosted web application for [CERN Open Data](https://opendata.cern.ch): one search experience that returns **dataset handoffs**, **cited answers**, or **honest refusals**.

This document is the product source of truth for UX, copy, and launch readiness — not a hackathon demo script.

---

## User promise

| Input | Output |
|-------|--------|
| Dataset / collision / catalog language | Live record: recid, metadata, download, portal |
| Detector / experiment questions | Answer with `[n]` citations + grounding receipt |
| Unsupported topics | Refusal + reason; optional unverified draft shown separately |

---

## Primary journey (Investigate)

1. **Status strip** — Catalog · Model · documentation index size  
2. **Query** — sticky search field; Enter to send, Shift+Enter for newline  
3. **Suggestions** — starter questions on empty home  
4. **Results** — turn summary → progress (while running) → one of three outcome cards  
5. **Other matches** + **Continue with** follow-up chips  
6. **Footer** — Help, Trust, keyboard hints  

**Dock:** Home · New · Datasets · Search · History · Help  

---

## Secondary surfaces

| Surface | Purpose |
|---------|---------|
| Datasets tab | Full catalog list for current investigation |
| History drawer | Session thread + composer |
| Help sheet | Full product guide |
| Trust panel | Safety rails and sourcing rules |
| Command menu (Ctrl+K) | Navigation shortcuts |
| Record drawer | File list for one recid |
| About | Static product + trust summary |

---

## System behavior (user-visible)

- **Degraded banner** when API unreachable, catalog down, model offline, or empty index  
- **New investigation** asks for confirmation if a thread exists  
- **No accounts** — session state is in-browser until refresh  
- **Tool stream** — compact progress while agent runs; hidden after success  

---

## Engineering map

| Layer | Location |
|-------|----------|
| UI shell | `frontend/src/layouts/DashboardShell.tsx`, `BottomDock.tsx` |
| Main UX | `frontend/src/components/chat/SimpleChatLayout.tsx` |
| Help | `frontend/src/components/HelpSheet.tsx` |
| API | `backend/app.py`, `POST /api/agent/stream` |
| Deploy | [HOSTING.md](HOSTING.md) |

---

## Launch checklist

See [HOSTING.md](HOSTING.md). Product-side:

- [ ] Help and Trust readable on mobile  
- [ ] Every click target has label/title  
- [ ] Empty and error states have plain language  
- [ ] `frontend/dist` built with `SERVE_FRONTEND=1`  
- [ ] Health banner matches `/api/health`  

---

## Roadmap (post-launch)

- Optional user accounts / saved investigations  
- LLM answer token streaming  
- Sticky session restore (localStorage)  
- Public status page  

Legacy technical phases remain in [ROADMAP.md](ROADMAP.md).
