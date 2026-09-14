# Investigate (Home) — Beamline

> Overrides `design-system/beamline/MASTER.md` for the main chat flow only.

## Layout

- **Max width:** 640px centered column; bottom dock stays visually aligned with this column.
- **Structure:** Status strip → sticky composer → (idle: hero + suggestions | active: turn summary → progress → passport → evidence → follow-ups).
- **Density:** Medium — one primary task per viewport; avoid side-by-side competing panels on mobile.

## Typography

- **Queries / citations:** serif accent (Crimson Pro italic) for quoted user questions and the hero line.
- **Body UI:** Atkinson Hyperlegible for readability (WCAG-friendly).
- **Display:** General Sans for product chrome.
- **Labels / meta:** IBM Plex Mono, uppercase microlabels.

## Color

- Keep paper background (`#ecede8` / `#f8fafc` family); primary action ink + cobalt links.
- **Warning banner:** model offline — use `--signal-warning`, not destructive red.
- **Success / grounded:** cobalt + left border, not green-only status.

## Interaction (UI UX Pro Max checklist)

- All dock, chips, and drawer controls: `cursor: pointer`, visible `:focus-visible` ring, min **44×44px** touch target on viewports ≤768px.
- `prefers-reduced-motion`: disable scale on dock press and prompt dot animation.
- Sticky composer + system banner: set `scroll-padding-top` / `scroll-padding-bottom` so focus is not hidden.
- Drawers (Help, History, Trust): focus **Close** on open; **Escape** closes; backdrop click closes.

## Avoid

- Demo/presenter chrome, collision animations, stat-box dashboards on this page.
- Placeholder-only labels (composer has `aria-label`).
- Truncating session thread chips without `title` (full query in `title`).
