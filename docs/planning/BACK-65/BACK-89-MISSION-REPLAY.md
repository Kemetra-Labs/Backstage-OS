# BACK-89 (S8): the Mission Replay inside the Investigation Room, with explicit time semantics

Synthetic only. No automated approve, retry or run action, no live replay, no new package or entry. Persona is a display switch, not authorization: no server-side identity, tenant or X02/X04 enforcement exists or is claimed.

Base: BACK-88 (draft PR #63). Stacked: #60 to #63, then this PR.

## The semantic problem, found in the data before any code

The replay's clock labels ("14:02", "14:03", ...) are the **processing clock**: when Kawalys processed each signal, in the order it processed them. They are not when things happened, and not when a source read them. The evidence carries its own read time (`observation.observedAt`), and the two disagree:

| Replay event | Processed at | Evidence read by its source |
|---|---|---|
| R-1 CI check failed | 14:02 | 14:02 (E-1) |
| R-2 PR merged | 14:03 | **13:27** (E-2), 35 minutes before the failure it is processed after |
| R-4 issue linked | 14:05 | 13:51 (E-3) |
| R-3, R-5 (gap), R-6, R-7 | 14:04, 14:06, 14:07, 14:08 | none (no readable evidence time) |

Read as a timeline, the lab's screen would say the PR merged after the CI failure. The data says the opposite. "When it actually happened" is not recorded anywhere in the demo data.

## What was built (time semantics first, nothing re-ordered, nothing invented)

- `src/bridge/replayTime.ts` (pure, no React, no state): for each event of the persona's **authorized** replay it returns the processing step and clock, the evidence read time when the event rests on readable evidence (else none), and an order status: `consistent` (read times agree with the processing order), `uncertain` (a read time disagrees with another event's, so the processing order must not be read as the order things happened) or `unknown` (no read time to compare). An event without evidence is never given a time. "Occurred" is not modelled, so it is never shown.
- A "What the times mean" panel with a table (step, event, processed by Kawalys, read by its source, order) sits under the replay and states in words that the replay order is the processing order, not the order things happened, and that occurrence time is not recorded. EN and AR.
- The replay itself is the V2 Mission Replay, embedded: same cursor, stages, hold tabs (correlations, hypotheses, gaps), milestones, inspector and proposal text; its title is an h2 (`embedded`). It plays and scrubs a view-state cursor over fixed events and acts on nothing.

## Wiring (one authority)

- Route: `#/investigation/<id>` is the room (default, unchanged apart from a link switch above it); `#/investigation/<id>/replay[/<event>]` is the replay view of the same case. Only the case with the full room (INV-DEMO-7) has the switch; other cases keep their summary room. The map inspector's and the Flight Deck's "open the replay" now land on the replay view.
- `hostV2.ts` derives the replay's `useV2()` value from the host's persona, language and route. The selected event is in the route. Moving the cursor (play, scrub, step) **replaces** the history entry (`hostNav.replace`, which raises the host's hashchange itself) so playback does not fill Back with one entry per step; Back leaves the replay view.
- The replay writes its starting event into the route when none is given (the lab's default), so `#/.../replay` settles to `#/.../replay/R-6` without adding history.
- Lazy lens, shared stylesheet chunk and error boundary with the map and the Observatory.

## Privacy

The time table, the step numbers and the row count come from the same authorized replay as the story: a withheld record contributes no row, no time and no gap, and the remaining steps are renumbered 1..n so a missing number cannot show that something was removed. Tested for Owner and Nontechnical in EN and AR over four routes, every tablist and tab, with text, hidden text, `aria-label`, `title`, `alt`, `href`, `data-*` and the address scanned for every restricted evidence and observation id; the table's row count equals the story's for every persona; a Technical, Owner, Technical, Owner, Nontechnical switch on one page.

## Tests

- Unit: `bridge/replayTime.test.ts` (processing order; times only from evidence; the R-1 and R-2 disagreement; consistent only when all agree; unreadable evidence is no time; lay worlds leak nothing and renumber), routes (parse, round trip, not-found), `hostV2` (replay route, replace vs push, fallback).
- Browser, `e2e/mission-replay.spec.ts` (24 tests, Chromium and WebKit = 48): layout at four widths in EN and AR (one shell, one h1, no overflow, no console errors), room default and the switch, the three times and the honest "not recorded", event in the route with history replaced (and Back leaving the view), deep link through reload and persona and language switches, unknown event and case, keyboard scrubber, the Map to Replay and Map to Observatory round trips, the non-disclosure matrix and persona switch, read-only labels and no "live", reduced motion.

## Evidence

| Check | Result |
|---|---|
| `npm run check` | PASS: 672 tests in 40 files (was 658), coverage 99.84% |
| `npm run build`, `npm run build:v2` | PASS, PASS |
| `npm run e2e` (Chromium + WebKit) | Full run: 1,634 passed, 66 skipped, 12 failed. All 12 were one real defect of mine: the Arabic link label I chose for "Replay" ("إعادة التشغيل", "re-run") is an action verb under the project's forbidden-control-label rule (`flow.spec` and `investigation.spec`, AR, 3 personas, 2 browsers). Fixed by using the lab's own noun ("إعادة المهمة"). After the fix, `flow`, `investigation` and `mission-replay` specs together: 475 passed. The full suite was not re-run end to end after that fix. |
| `npm run e2e:v2` (Chromium) | PASS: 313 passed, 32 skipped, 0 failed |
| Axe, screen reader (BACK-32), native Arabic (BACK-31), real devices, 200% zoom measurement, tenant or production security | NOT RUN |

## BLOCKED / needs an owner decision (the disputed time segment, paused as the ticket allows)

The replay **order** itself is not changed. The lab's order is the processing order and this slice only labels it as such. Ordering the timeline by evidence time, or showing "when it happened", needs an owner decision on two points the data cannot settle:

1. Which time the replay should be ordered by: processing time (today), source read time (where it exists), or a modelled occurrence time (not in the data). Four of the seven events have no evidence time at all, so a pure read-time order is impossible for them.
2. What an "occurred" time means for each source (a PR record's read time is not necessarily its merge time).

Until then the screen says plainly that the order is the processing order and marks the events whose evidence disagrees.

## Unresolved, recorded not reconciled

- Mission event-count semantics (BACK-90 scope) are untouched here.
- The replay's persona wording and hold-tab content are the lab's.

## Rollback

Revert the commit: removes the route form, the switch, the lens, the time table and the tests; the room is as before.
