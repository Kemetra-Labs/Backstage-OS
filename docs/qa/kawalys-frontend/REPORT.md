# Kawalys synthetic frontend: build and QA report

Date: 2026-11-17. Scope: the owner-authorised frontend-only build in `app/` (BACK-10 shell, BACK-11 Portfolio,
BACK-12 Project Intelligence, BACK-6 integration, Evidence Explorer, BACK-13 Decision Inbox, Command Home, and the
Agent and Source demo screens). Synthetic data only. There is no backend, real API, auth, agent execution or Jira
transition. The static prototype is unchanged.

Method: the lead (Opus) built the M1 foundation. Five parallel Sonnet agents built the screens, each owning
separate files. The lead then validated: the shared-file audit, fixes, the full test runs, and a visual review of the
screenshots.

## 1. Screen inventory

| Screen | Route | Status |
| --- | --- | --- |
| Command Home | `#/` | Complete |
| Portfolio / Mission Overview | `#/portfolio` | Complete |
| Project Intelligence (map, table, filters, selection) | `#/project/:id[/:component]` | Complete |
| Investigation Room (S1, integrated) | `#/investigation/INV-DEMO-7` | Complete |
| Investigation summary (conflicting signals) | `#/investigation/INV-DEMO-9` | Complete (summary room by design; the full room exists only for INV-DEMO-7) |
| Evidence Explorer | `#/evidence/:id?from=` | Complete |
| Decision Inbox and detail (display only) | `#/decisions[/:id]` | Complete |
| Agent activity (demo) | `#/agents` | Complete |
| Source health (demo) | `#/sources` | Complete |
| Settings, workspace management, customers | — | Not started (no approved requirement) |

## 2. Walking the synthetic scenario

1. Command Home lists the high-priority Retail Tower item first. **Open case {INV-DEMO-7}**, or go through the
   Portfolio.
2. Portfolio: **View {Retail Tower OS}** → Project Intelligence. Select `stock-sync` on the map; it reads "CI check
   failing", health unknown.
3. **Open case {INV-DEMO-7}** → Investigation Room. Open evidence E-1 in the drawer → **Open in Evidence Explorer**.
4. The Explorer shows provenance and freshness; **Back to {INV-DEMO-7}** returns.
5. From the room, **Open proposal {DEC-DEMO-3}** shows observed facts, a hypothesis, unknowns, three options and a
   proposed human next step. Nothing on it is a control.
6. Use the top-bar switches for Owner, Technical and Nontechnical, and for EN and عربي. The choice persists in the
   URL. Search finds ids such as `RT-DEMO-112`.

Other states: `#/project/KH` and `#/investigation/INV-DEMO-9` show conflicting signals (CI green, errors rising).
`#/project/SB` shows a not-configured, empty product. `#/evidence/E-12` is restricted for Owner, and
`#/evidence/E-24` is not read.

## 3. Design system

- Tokens: unchanged C2 dark-first set in `app/src/styles/tokens.css`.
- Shared layout: `shell.css` (top bar, sidebar, which becomes a menu below 1024 px, search) and `components.css`.
- Shared components:
  - `AppShell`, `ScreenHeader` (the single h1), `Breadcrumbs`, `Panel` (one surface level)
  - `HealthTriad`: connectivity, freshness and health as three separate marks
  - `StateBlock`: loading, empty, error, restricted, unavailable, not set up, unknown
  - `DepGraph` (left to right in both languages) with `DepTable` as the accessible alternative
  - `Timeline`, plus the S1 `TruthChip`, `SourceChip`, `Segmented`, `Text` and `L`/`LP`
- One data world: `app/src/fixture/world.ts`. One evidence redaction allowlist: `app/src/view/evidence.ts`.

## 4. Skill use

| Skill | Status |
| --- | --- |
| Anthropic `frontend-design` | Project-installed in `.claude/skills/frontend-design` from anthropics/skills @ `e4bb5d9`, Apache-2.0. Briefed to all five screen agents; **their use of it is not confirmed** (no agent report mentions it) |
| Impeccable v4.9.2 | Project-installed in `.claude/skills/impeccable` from pbakaus/impeccable @ `d41d986`, Apache-2.0. Its markdown references only; `scripts/` (a binary launcher) was deliberately not vendored. **Used:** a critique run against `critique.md` + `critique-rubric.md` on 9 screenshots, rubric-only because the detector needs the launcher. It scored 26/40, "Acceptable". Fixes applied: navigation links restyled from outlined buttons to quiet links, sidebar background running full height, mobile header compacted. Deferred: see §8 |
| Hallmark | Available at user level; offered to the agents as an anti-pattern check. Use not confirmed. Not vendored |
| `design:design-critique`, `design:accessibility-review`, code-reviewer agent | **Not run.** An advisor review (fresh lens) and the Impeccable critique took their place |
| Playwright | Used: per-screen specs, a cross-route rules spec and screenshot capture |

## 5. Test results (Windows 11, local, 2026-11-17)

| Command (from `app/`) | Result |
| --- | --- |
| `npm run check` (tsc + Vitest + coverage) | **PASS**: 21 files, 323 tests; coverage 99.95% lines, 97.18% branches |
| `npm run build` | **PASS** |
| `npm run e2e` (chromium + webkit engines) | **PASS**. The last full run gave 1092 passed and 4 failed: the new breadcrumb touch-target check caught the "Khepri" crumb at under 44 px wide. After the fix, all 52 touch-target tests pass. The earlier full run, before the critique fixes, gave 1094 passed and 0 failed |

The skipped tests are:
- 64 capture tests, which only run with `CAPTURE=1`
- the WebKit clipboard test (pre-existing)
- the WebKit link-Tab-order test (WebKit leaves links out of Tab order by default; it is covered on Chromium)

`e2e/flow.spec.ts` checks 17 routes for every persona and language at 320 px:
- one h1 and valid heading order
- no horizontal overflow
- no forbidden action verb on any link or button
- no Latin text outside an LTR isolate in Arabic
- no raw `{token}` braces
- no run, job or PR ids for Owner or Nontechnical
- the demo marker present and no console errors

It also covers:
- the end-to-end journey, including browser back and forward
- persistence of persona and language
- the sidebar current-page state, the mobile menu, search and the skip link

Issues found and fixed during validation:
- Copy strings rendered without `Text` showed raw braces in Arabic.
- Long technical ids overflowed at 320 px. The shared id style now keeps ids whole and wraps only overlong tokens.
- WebKit let focus leave the evidence drawer through links. The trap now cycles focus itself.
- A fixture string named a deploy id for every persona.
- A human event was attributed to an agent.
- Link labels lost the space before ids.
- The map clipped tall nodes.
- In Arabic, the map scrolled to the wrong end.

## 6. Screenshots

`docs/qa/kawalys-frontend/screens/`:
- `desktop-en-owner/` (12 screens)
- `desktop-ar-technical/` (12)
- `mobile-en-nontechnical/` (4)
- `mobile-ar-owner/` (4)

What the lead actually looked at:
- At 1440: Home, Project RT (EN and AR), Decision detail, INV-DEMO-9, Agents and Sources.
- At 375, in the browser pane: Nontechnical Home in EN and AR, and Nontechnical INV-DEMO-9. These are viewport views, not full-page.

The full-page mobile PNGs are too tall to judge as single images. Review them by scrolling, or in the app at 375 px.

## 7. Changed files

- Everything under `app/` (screens, view, i18n, components, styles, e2e, README)
- `.claude/skills/` (vendored skills)
- `.gitignore`: `.claude/` became `.claude/*` + `!.claude/skills/`
- this report and its screenshots

No new npm dependencies. The static prototype, CI workflow and root tests are unchanged.

## 8. Gaps and checks not verified

| Check | Status |
| --- | --- |
| Comparison with the owner's five reference images | **BLOCKED**: the images are not in the repo |
| Real devices, BrowserStack | **NOT RUN** |
| Screen readers (NVDA, VoiceOver, TalkBack) | **NOT RUN** |
| 200% zoom | **NOT VERIFIED**: 320 px layouts pass, which approximates 640 px at 200% |
| Firefox | **NOT RUN** |
| `app/` in CI | **NOT COVERED**: the required CI job runs only the root prototype suite (BACK-9) |
| Persona redaction | Presentation only; real redaction must be server-side (ADR-03) |

| Touch targets | Buttons, `.btn` links and breadcrumbs are tested at ≥ 44 px at 375 px; breadcrumbs are 44 px below 1024 px wide. Inline text links inside sentences are **not** held to 44 px |

Deferred critique findings, for owner review:
- The Investigation Room is long (about 3700 px on desktop). Evidence appears three times: the ledger, the evidence list and the timeline. Candidate fix: collapse the timeline by default.
- Seshat-BI says "not set up" in three places.
- Portfolio's attention list repeats Home's.
- Muted 12 px meta text and mono chip labels sit near the floor for size and contrast.

Minor visual notes:
- Sources "What the states mean" uses bordered boxes inside a panel.
- At narrow widths the map scrolls horizontally inside its panel; the table is the fallback.
- Both "Project Intelligence" and "Retail Tower OS" can show as current in the sidebar.

## 9. Readiness

Ready for the owner's visual review of the whole synthetic flow in EN and AR across the three personas. Not ready for:
real data, the reference-image sign-off, or device and assistive-technology sign-off.

## 10. Next phase

1. Owner visual approval against the five reference images.
2. BACK-9: add `app/` to the required CI job.
3. Only after the G2 approval gate (BACK-7 §8): BFF, the GitHub read adapter and server-side redaction.
