# BACK-90 (S9): the read-only Agent Flight Deck inside the existing Agents screen

Synthetic only. No agent runs, no approve, stop, cancel, retry or execute action, no background worker, no real source call, no performance metric or autonomy claim. Persona is a display switch, not authorization: no server-side identity, tenant or X02/X04 enforcement exists or is claimed.

Base: BACK-89 (draft PR #64). Stacked: #60 to #64, then this PR.

## What the user gets

The Agents screen (`#/agents`) keeps its roster, oversight panel and activity history exactly as they are (default view, unchanged). A link switch adds a second view of the same screen: **Flight Deck** (`#/agents/deck[/<mission>]`): the V2 fleet overview, agent activity, mission detail, queues, human oversight, capabilities and audit panels, driven by the host's persona, language and route (same adapter as the map, the Observatory and the Replay). The selected mission is in the route, so Back, Forward and deep links work. The Deck's "open the audit trail" is now a host navigation to the Replay view and Back returns to the mission. One h1 (the host's); the Deck's title is an h2.

## The unresolved semantic, classified unknown (as the ticket requires)

A mission has an `events` figure and the fixture does not say what it counts. The lab scopes it for a persona by subtracting one per withheld evidence reference, which is an assumption, and a figure that differs by persona is itself a cue that something was removed. In the embedded Deck the figure is shown as **"Not defined in the demo data"**, for every persona and every mission (Technical included, so there is no persona-dependent number). The standalone lab is unchanged: `embedded` is false there and its own tests still pass.

**Owner decision, 23 Nov 2026: option A now, option D later.** The figure is not defined by the fixture, in the standalone lab as in the host. The lab now shows the same "Not defined in the demo data" wording, and the subtraction in `scopeMission` is removed: a mission's `events` is never recomputed, displayed or derived from evidence, for any persona. The `events` field stays in the type and the fixture for now; removing it (option D) is a separate, audited change. Option B (count of evidence references) is rejected and option C (real activity events) is not approved.

**BACK-96 (option D, done):** an audit found no product reader of a mission `events` value, so the field is removed from `Mission` and the fixture. The Deck still says "Not defined in the demo data" for every persona and language. The audit panel Events figure (length of the authorized replay, BACK-89) is a different thing and is unchanged.

## Read-only, tested

No control labelled or aria-labelled with a forbidden action verb in EN or AR (the repo's own `isForbiddenControlLabel`), no run, approve, stop, cancel, retry, execute, deploy, merge, release, start or restart button, no text input, a visible "simulated" banner, and no "live" claim other than the page's own "Nothing on this page is live". The agents are fixture rows; every control only moves a view.

## Wiring

- Route: `#/agents` (roster), `#/agents/deck`, `#/agents/deck/<mission>`; anything else under `#/agents/` is not found.
- `hostV2.ts` gains the Deck context (`msn` from the route, `go({msn})` and `open('agent-flight-deck', {msn})` as host navigations). A mission change is a navigation (Back returns to the previous mission), not a replace.
- Lazy lens, shared stylesheet chunk and error boundary (`LensBoundary`) with the other lenses; the roster is untouched when the chunk fails.

## Privacy

All five missions stay listed for every persona. Tested for Owner and Nontechnical in EN and AR over all five missions, every segmented control and tab in the Deck: text, hidden text, `aria-label`, `title`, `alt`, `href`, `data-*` and the address are scanned for every restricted evidence and observation id; plus a Technical, Owner, Technical, Owner, Nontechnical switch on one mission that also checks every mission stays listed. A mission whose whole basis is withheld keeps no claim (label unknown), as before.

## Tests

- Unit: routes (parse, round trip, not-found), `hostV2` (Deck context, mission change, defaults).
- Browser, `e2e/agent-flight-deck.spec.ts` (23 tests, Chromium and WebKit = 46): layout at four widths in EN and AR, roster default and the switch, mission selection as a navigation with Back, Forward, deep link, reload, persona and language switch, unknown view not found, the events figure for 3 personas x 5 missions x 2 languages, read-only and simulated, the Deck to Replay to Back journey, the non-disclosure matrix and switch, reduced motion.

## Evidence

| Check | Result |
|---|---|
| `npm run check` | PASS: 680 tests in 40 files (was 672), coverage 99.84% |
| `npm run build`, `npm run build:v2` | PASS, PASS |
| `npm run e2e` (Chromium + WebKit) | Full run: 1,691 passed, 66 skipped, 1 failed: a race in my BACK-89 spec (`count()` read straight after `goBack()`, before React re-rendered, WebKit). The same pattern existed in the Observatory and Deck specs, so all three now use the auto-waiting `toHaveCount(0)` (this commit touches those specs for that reason). After that, the map, Observatory, Replay and Deck specs together: 202 passed. The full suite was not re-run end to end after that edit. |
| `npm run e2e:v2` (Chromium) | PASS: 313 passed, 32 skipped, 0 failed |
| Axe, screen reader (BACK-32), native Arabic (BACK-31), real devices, 200% zoom measurement, tenant or production security | NOT RUN |

## Unresolved, recorded not reconciled

- What a mission's `events` counts is an owner/fixture decision; no screen shows a number (decided, see above); the field's removal is a separate future change.
- The audit panel's "Events" figure is the length of the persona's authorized replay (the same list the Replay shows), so it is consistent with what that persona sees; its time semantics are BACK-89's.
- Agent names, roles and mission wording are the lab's fixture copy.

## Rollback

Revert the commit: removes the route form, the switch, the lens and the tests; the roster screen is as before.
