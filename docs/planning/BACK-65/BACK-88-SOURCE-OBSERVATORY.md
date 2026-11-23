# BACK-88 (S7): the Source Observatory inside the existing Sources screen

Synthetic only. No provider API, no live telemetry, no new package or app entry. Persona is a display switch, not authorization: no server-side identity, tenant or X02/X04 enforcement exists or is claimed.

Base: BACK-87 (draft PR #62). Stacked: #60 (BACK-85), #61 (BACK-86), #62 (BACK-87), this PR.

## What the user gets

The Sources screen (`#/sources`) keeps its tables exactly as they are and, by default, looks as before. A small link switch under the header adds a second view of the same screen: **Observatory** (`#/sources/observatory[/<provider>]`). It is the V2 Source Observatory: KPIs, the "source posture" (three independent readings: connectivity, evidence freshness, target health, never combined into a score), source cards or a table, the source timeline with axis filters, and an inspector (Details, Evidence, Provenance). There is one h1 (the host's); the Observatory's title is an h2 (`embedded`).

Why a view switch and not a section appended to the tables: the existing Sources tests state, on purpose, that the tables page has no buttons and never says "healthy" (target health lives on the product pages). The Observatory shows the three readings, including a Healthy word for GitHub. Keeping it a separate view leaves the tables contract untouched and makes the Observatory something a person chooses.

## Wiring (one authority)

- Route: `#/sources` (tables), `#/sources/observatory` and `#/sources/observatory/<provider>` with provider in `github | jira | confluence | sentry | datadog | port`. Anything else under `#/sources/` is not found.
- `bridge/hostV2.ts` now also builds the `useV2()` value for the Sources screen from the host's persona, language and route: the route carries the selected source, `go({src})` and `open('source-observatory', {src})` are host navigations. This also fixes review finding 7 of BACK-87 (opening the Observatory from the map's inspector now lands on the chosen provider).
- The lens is lazy (`SourceObservatoryLens`). It shares the stylesheet module `screens/lensStyles.ts` with the map lens, so the CSS is one shared chunk, loaded only when a lens opens. The shared `LensBoundary` shows a message if the chunk cannot load and the tables remain.
- The V2 component gained one optional prop (`embedded`, h2 and no pilot chip); standalone behaviour is unchanged.

## Honesty of the readings (tested for all three personas)

GitHub: reachable, current, healthy (a current observed read of itself). Jira: reachable, health **unknown** (claimed healthy with no evidence). Sentry: reachable, stale, health **unknown** (claimed healthy on a stale read). Port: unavailable, unknown. Datadog and Confluence: not set up, unknown. Exactly one source is Healthy, in every persona. KPIs, posture counts, cards and the timeline's events, times and sources are identical for Owner, Nontechnical and Technical, so no count or status differs because a record is withheld. Timeline wording is persona-specific by design (Technical sees the run id).

## Tests

- Unit: routes (parse, round trip, not-found cases), `hostV2` (Sources route to a Source Observatory context, source changes, `open` with and without a provider).
- Browser, `e2e/source-observatory.spec.ts` (25 tests, Chromium and WebKit = 50): layout at 320/375/768/1440 in EN and AR (one shell, one `<main>`, no lab shell, no overflow, no console errors); tables are the default and unchanged, the switch and Back; selection is a navigation (Back, Forward, deep link, reload, persona and language switch); unknown source not found; keyboard selection; the three readings and Unknown-never-Healthy per persona; equality of KPIs, posture, cards and timeline across personas; non-disclosure for Owner and Nontechnical in EN and AR over five routes, cards and table, every inspector tab and every timeline filter (text, hidden text, `aria-label`, `title`, `alt`, `href`, `data-*`, address); a Technical, Owner, Technical, Owner switch on one page; read-only controls and no "live"; reduced motion.

## Evidence

| Check | Result |
|---|---|
| `npm run check` | PASS: 658 tests in 39 files (was 648), coverage 99.84% |
| `npm run build`, `npm run build:v2` | PASS, PASS |
| `npm run e2e` (Chromium + WebKit) | Full run: 1,596 passed, 66 skipped, 2 failed. The 2 failures were the BACK-87 map spec still asserting that "Open in Source Observatory" lands on `#/sources` (provider dropped); this slice makes it land on `#/sources/observatory/github`, so the assertion was updated. After that, the map and Observatory specs together: 108 passed. The full suite was not re-run end to end after that edit. |
| `npm run e2e:v2` (Chromium) | PASS: 313 passed, 32 skipped, 0 failed |
| Axe, screen reader, native Arabic, real devices, 200% zoom measurement, tenant or production security | NOT RUN |

## Unresolved, recorded not reconciled

- The Observatory's own copy is the lab's; its "Scope: Retail Tower OS" note follows the lab (the tables are per product).
- The stale-source explanation and persona wording are unchanged from the lab.
- The V2 world's six sources and the V1 per-product source tables are two fixtures of the same providers; no id map is needed (providers are shared), but their health claims are not reconciled here.

## Rollback

Revert the commit: removes the route form, the view switch, the lens and the tests; the tables screen is as before. The shared `lensStyles`/`LensBoundary` refactor of the map lens is part of the same commit and reverts with it.
