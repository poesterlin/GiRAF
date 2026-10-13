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

Hands-free autosave: the latest snapshot is updated in place for minor tweaks,
and a new snapshot row is created only on a meaningful change.

- Debounced background autosave, two seconds after the edit settles, flushed on
  navigation, tab hide and page hide. The manual Save button is replaced by a
  save state in the footer (`Saving…` / `Unsaved` / `Saved`), and `S` still
  writes a version immediately.
- **New snapshot (`POST`)** when any of these hold:
  1. It is the first edit on the image.
  2. The latest snapshot has already been exported, or is older than ten
     minutes.
  3. A structural change occurs — crop, rotation or other geometry, film
     simulation / LUT, monochrome, masks, or retouch spots.
  4. Accumulated slider movement exceeds a distance from the saved version.
- **Update in place (`PATCH`)** for small iterative refinements within the same
  version. The server only rewrites the newest snapshot; anything older is
  refused and the client creates a version instead.

`src/lib/snapshot-classifier.ts` holds the rules with unit tests,
`src/lib/ui/EditorAutosave.svelte` drives the loop for every editor tool, and
`src/lib/snapshot-queue.ts` performs the write and the fallback.
`scripts/editor-autosave.browser.integration.ts` exercises the loop end to end
against a stubbed endpoint.

Distance counts slider movement in units of "a meaningful part of one field's
range", with per-field ranges for fields whose stored magnitude says nothing
about the edit (`Temperature`, `Green`, `Feather`, …) and a whole step for
curves, thresholds and file names. Structural chapters are excluded from the
distance because they already force a version.

In-place updates deliberately leave the edited thumbnail alone: it belongs to
the version that was created, so the gallery can show that render until the next
version is written. See `edited-gallery-thumbnails.md`.

## #7 — Importer selection and scroll

1. The inner `overflow-y-auto` container in `src/routes/importer/+page.svelte` is
   bound, and touch drag-selection scrolls it and measures its edges instead of
   using the window.
2. The bottom floating action bar is `inert`, `aria-hidden` and
   `pointer-events-none` while nothing is selected, so the hidden bar cannot be
   reached by keyboard or pointer.
3. The per-date-group toggle reads `Select All` or `Deselect All` and reports its
   state with `aria-pressed`.

## #8 — Exporter action cleanup and touch unlink

1. The duplicate `Sync` and `Re-export` buttons in
   `src/routes/exporter/SessionList.svelte` are one button: `Sync` when the
   session has albums, `Re-export` when it has none. Both still call
   `exportSession(item.id)`.
2. The album unlink is always visible where hover does not exist, revealed on
   hover or keyboard focus where it does, and labelled for screen readers.
