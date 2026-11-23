# BACK-87 (S5b/S6): the B+C Mission Map inside the one AppShell

Synthetic only. No new package, library, backend, schema, separate HTML page, V3, or default-theme change. Persona is a display switch, not authorization: no server-side identity, tenant or X02/X04 enforcement exists or is claimed.

Base: BACK-86 (draft PR #61), which is on BACK-85 (draft PR #60), on `main` `c7f9825`. Stacked.

## What the user gets

A new host screen, `#/map`, in the existing sidebar (EN "Mission Map", AR "خريطة المهام"). It is the approved B+C map (orbit canvas, accessible ledger as the List view, matrix, links table, timeline, inspector with Overview / Evidence / Sources, filters, scope) rendered inside the host `<main>`, under the host top bar, persona and language switches, search and source strip. The V1 screens (Home, Portfolio, Project Intelligence, Investigation, Evidence, Decisions, Agents, Sources) are unchanged and keep working. The React Flow dependency map stays the opt-in `?renderer=flow` view of Project Intelligence; nothing was flipped to a new default.

## How it is wired (one authority)

| Concern | Authority | How the map reads it |
|---|---|---|
| Persona, language | host `AppContext` (top-bar switches, `?persona=&lang=`) | `src/bridge/hostV2.ts` builds the `useV2()` value from them |
| Route and selection | the host hash router (`nav/routes.ts`, `#/map/<scope>/<node>`) | `toMapContext` derives scope and node from the route on every render; nothing is remembered |
| Evidence and authorization | `authorizedWorld` over the canonical model (BACK-84) | the map reads the same scoped world as before |
| Changes the map asks for | host navigation | `go` and `open` become `window.location.hash = hrefFor(...)` |

- No V2Provider, no V2 shell, no second persona, language or route state. `design-lab/v2/context.tsx` gained one line, `export const V2Context = Ctx`, so the host can supply a value derived from its own state; the adapter has no React and no state (a test scans the sources).
- Route grammar (new, additive): `#/map`, `#/map/<scope>`, `#/map/<scope>/<node>` with scope in `all | retail-tower | khepri | seshat-bi`. An unknown scope is not found, never guessed. A node id the persona's world does not hold is dropped, not echoed. Existing routes are untouched.
- A selection is a navigation (the lab replaced the history entry): Back and Forward restore the previous selection, and a deep link selects the node. Selecting inside the map does not move focus to `<main>` (same screen key); arriving at the map from another screen does.
- The lab's other screens map to host routes: Source Observatory to `#/sources`, Replay to the Investigation Room, Flight Deck to `#/agents` (those are folded in by BACK-88, 89 and 90).
- A "open this system in Project Intelligence" link appears only for a verified identity (BACK-85: RT and its three shared components). For a service or an unverified product it says why there is no link.
- Code split: the map and its nine stylesheets are one lazy chunk (`MissionMapLens-*.js/.css`), fetched only on `#/map`; a failure shows a message and every other screen keeps working. The V1 entry stylesheet still has no `.kv2-` text.

## Defects found by the tests and fixed

1. At 320 and 375 px the map region was wider than the phone: it is a grid item of the host `<main>`, whose automatic minimum width is its content. One layout rule in `scope.css` (`min-inline-size: 0`) fixes it. The lab never showed this because its `html`/`body` clip horizontal overflow.
2. The existing guard "V1 assets carry no V2 selectors" (`e2e-v2/structure.spec.ts`) was written for two separate apps. Mounting the map deliberately ends that separation, so the guard was narrowed, not removed: the stylesheets V1's entry links must still carry no `.kv2-`/`--kv2-`, and the only files that may are the lazy `MissionMapLens-*` chunk. The V2-side half is unchanged.
3. Three test mistakes of mine, not app defects: a Safari/WebKit click does not focus a button (focus lands on `<main>`), the query parameters are not in a fixed order, and a "replay" check used a node with no provider.

## Tests

- Unit: `nav/routes.test.ts` (parse, round trip, not-found cases for the new route), `bridge/hostV2.test.ts` (map route to context, persona x language matrix, every change becomes a host navigation, other lab screens map to host routes, hostile scope ignored, produced routes survive href and parser and carry no restricted id), `bridge.test.ts` guard (no React, no provider at runtime, no module state; type-only imports and comments excluded), `i18n/screens/map.test.ts`, `styles/isolation.test.ts`.
- Browser, `e2e/mission-map.spec.ts` (29 tests, Chromium and WebKit = 58): layout at 320/375/768/1440 in EN and AR (one shell, one `<main>`, one h1, no second lab shell, no overflow, no console errors, right direction), nav entry and focus, hash carries only the selection (persona and language stay in the query), Back/Forward, deep link through reload and persona and language switch, scope navigation, unknown scope not found, dropped foreign id, keyboard arrows and Enter, list-first on a phone, reduced motion, inspector actions are host navigations, Project Intelligence link rules, read-only (no operational control, three personas), and the non-disclosure matrix: Owner and Nontechnical x EN and AR x five routes (including a probe that types `E-5`) x map and list x every inspector tab: no restricted evidence id or observation id in visible text, hidden text, `aria-label`, `title`, `alt`, `href` or any `data-*`; the address is clean except where the tester typed it. A Technical, Owner, Technical, Owner switch on one page leaves nothing behind, and Technical sees the record (so the check is not vacuous).

## Evidence

| Check | Result |
|---|---|
| `npm run check` | PASS: 648 tests in 39 files (was 620), coverage 99.84% |
| `npm run build`, `npm run build:v2` | PASS, PASS |
| `npm run e2e:v2` (Chromium) | PASS: 313 passed, 32 skipped, 0 failed |
| `npm run e2e` (Chromium + WebKit) | Full run: 1,547 passed, 66 skipped, 1 failed (my WebKit focus assertion, above). After fixing it, `e2e/mission-map.spec.ts` alone: 58 passed. 1,448 existing + 42 isolation + 58 map = 1,548, all green; the full suite was not re-run end to end after that last spec edit. |
| `git diff --check` | PASS (CRLF conversion warnings only) |
| Visual check | Screenshots of `#/map` at 1440 px (EN) and 375 px (AR, list-first) taken and inspected during development; not committed. |
| Axe, screen reader (BACK-32), native Arabic review (BACK-31), real devices, 200% zoom measurement, pixel comparison against the lab, production or tenant security (X02/X04) | NOT RUN, not claimed |

## Unresolved, recorded not reconciled

- **The `stock-sync` to `inventory` edge.** The map takes the canonical truth (hypothesis, no evidence: the weaker claim). The V1 Project Intelligence map still shows it as authored on E-7. Both screens now exist in one app with different classifications for the same edge. No screen on the map asserts the stronger claim, but the disagreement is visible across screens until the owner decides. Pinned by `domain/parity.test.ts`.
- The chip "B + C pilot" is the lab's wording and is kept as approved. Whether the production screen drops it is a product call.
- The map's own copy is the lab's table; persona-specific wording there is unchanged.
- The Project Intelligence page and the map are two views of the same systems; merging their inspectors is not attempted here.

## Rollback

Revert the commit. It removes the route, the nav entry, the lens, the adapter and the tests; restores the isolation guard; the lab and every V1 screen are as before. The CSS from BACK-86 stays inert.

## Next

BACK-88: fold the Source Observatory into the existing Sources screen, reusing the scoped world, the adapter and the same lazy-chunk pattern.

## Independent pre-PR review (code-reviewer agent, read-only)

No restricted id reached the DOM, an attribute or a link; route parsing, `hrefFor` encoding, the single hash write, memo dependencies, focus and Back/Forward and the absence of a second persona/language/route state were each traced and found sound. Findings and what was done:

| # | Finding | Outcome |
|---|---|---|
| 1 | The "open in Project Intelligence" link ignored the map's default selection: `#/map` linked `#/project/RT`, `#/map/all` said "not verified" for a verified system | Fixed. The lab's fallback rule is now exported (`fallbackNode`) and the link uses the effective selection. e2e covers `#/map`, `#/map/all`, `#/map/retail-tower`. |
| 2 | The non-disclosure e2e scanned the map view only on the first route (the view toggle persists between hash navigations) | Fixed. Each pass clicks its toggle and asserts the mode; the address is also checked after every tab. |
| 3 | The unit test for "drops a non-node id" cannot fail on persona scoping (node ids do not differ by persona; evidence ids are never node ids) | Title now says what it proves; the trimmed-world test exercises the world check itself. Stated limit: no node of the current world is withheld from any persona. |
| 4 | A typed unknown or restricted id stayed in the address bar and history | Fixed. The lens replaces the address with the canonical route (no new history entry); e2e asserts the probe `#/map/retail-tower/E-5` becomes `#/map/retail-tower`. |
| 5 | The inspector tab (and list/map view, filter) live in a module-level store, outside the route; Back to an earlier node can open on the previous tab | Not changed. It is UI-local view state, not persona, language or selection. Recorded as a limit; moving it into the route is a follow-up. |
| 6 | The lazy-chunk boundary cannot retry a failed chunk and labels any render error as "could not load" | Not changed. Recorded; a reload recovers. |
| 7 | Opening the Source Observatory drops the provider (`#/sources` has no selection yet) | Deferred to BACK-88, which adds `#/sources/<provider>`. The unit test records the current behaviour. |

After the fixes: `npm run check` 648 tests pass (coverage 99.84%), `npm run e2e:v2` 313 passed, `e2e/mission-map.spec.ts` 58 passed (Chromium and WebKit).
