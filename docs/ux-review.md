# UX review and design decisions

Design review of the live app across Home, Importer, Gallery, Triage, Editor,
Exporter and Settings. This document records the surviving issues, the decisions
taken, and the agreed solutions. Nine candidate issues were raised; four were kept
for action, and the rest were dismissed as intended design or not currently painful.

## Candidate issues

Kept for action:

- **#3 / #5 — Top navigation and workflow indicator.** The top bar treats every
  step as an equal page, and `/triage` and `/editor` are filler hub pages that act
  as dead ends.
- **#4 — Desktop editor has no save feedback.** Editing on desktop relies on a
  mobile-only manual Save button, with no autosave.
- **#7 — Importer selection and scroll.** Drag-selection auto-scroll scrolls the
  window instead of the list, and the hidden `IMPORT 0 FILE` bar stays focusable.
- **#8 — Exporter actions.** Duplicate `Sync` / `Re-export` buttons, and the album
  unlink (`×`) is only reachable by mouse hover.

Dismissed:

- **#1** Importer preview queue — not causing problems today.
- **#2** 50% before/after split — intended design.
- **#6** All 13 adjustment panels expanded — intended design.
- **#9** Toast and notification colors — fine for now.

## #3 / #5 — Top bar navigation

The top bar does not need every step to be a clickable page. It should act as a
workflow status indicator while keeping `Import`, `Gallery` and `Export` reachable
as ordinary clickable pages. `Triage` and `Editor` are per-photo stages entered
from a session, not top level pages, so they drop out of the bar and the
dead-end `/triage` and `/editor` hubs stop being navigation destinations.

Rejected directions and why:

- Icons and arrows between every step — too busy and unpolished.
- A five-step clickable flow — same problem; steps are not all pages.
- An all-or-nothing minimal variant — "10/10 minimal" was considered too extreme.

Final design (single center pill, dots on):

- **Top level pages.** `Import | Gallery | Export` are always clickable links
  separated by subtle hairline dividers, with a single borderless soft pill
  marking the active page. No icons, no arrows.
- **Inside a session.** The center `Gallery` slot expands inline into one
  borderless soft pill: a back-link to the gallery labelled with the session
  name, the current stage, and a two-step micro-dot indicator.
  `Import   [ ‹ Session / Editor • ━ ]   Export`
- No nested pill-inside-pill borders; the session name stays visible so the user
  always knows which collection they are in.
- When triage is disabled, the editor is the only session stage and a single dot
  is shown.

Implemented in `src/lib/ui/FlowNav.svelte`, with the path to bar mapping in
`src/lib/flow-nav.ts` and tests in `src/lib/flow-nav.test.ts`. The session name
comes from the session-scoped loads (`editor/[img]` layout and `triage/[img]`
page), which return `session` so the root layout can read it from `page.data`
without re-running its own load on every image step. The `/triage` and `/editor`
hub pages are no longer linked from the bar and remain reachable from the home
page cards.

## #4 — Smart autosave with a "meaningful change" classifier

Replace the manual save with hands-free autosave: update the latest snapshot
in-place for minor tweaks, and create a new snapshot row only on a meaningful
change.

- Debounced background autosave (~1.5–2s after slider idle), flushed on
  navigation and tab hide. The mobile-only Save button is removed.
- **New snapshot (`POST`)** when any of these hold:
  1. It is the first edit on the image.
  2. The latest snapshot is older than a time threshold (about 10 minutes).
  3. A structural or categorical change occurs — LUT / film simulation,
     monochrome toggle, crop or rotation, masks, retouch spots, or a pasted or
     reset profile.
  4. Cumulative slider adjustment across categories exceeds a distance threshold
     from the previous snapshot.
- **Update in place (`PATCH`)** for small iterative slider refinements within the
  same active editing pass.

## #7 — Importer selection and scroll

To validate on implementation:

1. Bind the inner `overflow-y-auto` scroll container in
   `src/routes/importer/+page.svelte` and call `scrollContainer.scrollBy(...)`
   instead of `window.scrollBy(...)` during touch drag-selection.
2. Add `inert` (when nothing is selected) and `pointer-events-none` to the bottom
   floating action bar so the hidden bar is not focusable.
3. Toggle the per-date-group `Select All` ↔ `Deselect All` label when all items in
   that group are selected.

## #8 — Exporter action cleanup and touch unlink

1. Merge the duplicate `Sync` and `Re-export` buttons in
   `src/routes/exporter/SessionList.svelte`; both call `exportSession(item.id)`.
2. Make the external album unlink (`×`) reachable on touch devices instead of
   relying on desktop-only `group-hover`.
