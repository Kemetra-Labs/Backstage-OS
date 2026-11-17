# Kawalys V2 visual lab

Four interactive, reference-driven screens built as an **isolated** React + TypeScript experiment next to the existing frontend. V1 is untouched. Nothing here is committed, merged or deployed; the owner decides what happens next.

Synthetic data only. No backend, auth, AI calls, credentials, or real GitHub / Jira / Sentry / Datadog / Port access. Nothing is live telemetry.

## Run it

```bash
cd app
npm ci                # once (also run `npm ci` at the repo root once, for Playwright)
npm run dev:v2        # V2 dev server  ->  http://127.0.0.1:4279/v2.html
```

| Screen | URL |
| --- | --- |
| Mission Map | `http://127.0.0.1:4279/v2.html#/mission-map` |
| Source Observatory | `http://127.0.0.1:4279/v2.html#/source-observatory` |
| Mission Replay | `http://127.0.0.1:4279/v2.html#/mission-replay` |
| Agent Flight Deck | `http://127.0.0.1:4279/v2.html#/agent-flight-deck` |

Everything a reviewer can change lives in the URL: `?persona=owner|technical|nontechnical&lang=en|ar` and, inside the hash, `scope`, `node`, `src`, `evt`, `msn`. Example: `#/mission-replay?persona=technical&lang=ar&evt=R-4`.

V1 stays where it was and runs on its own ports, so both can be open side by side:

```bash
cd app && npm run dev                        # V1 React slice (Investigation Room)  -> http://127.0.0.1:4178/
npm run serve   # repo root                  # V1 static prototype (map, sources, agents...) -> http://127.0.0.1:8765/
```

The V2 side navigation has "Compare with V1" links to both.

## Checks

```bash
cd app
npm run check       # tsc + unit tests (V1 contract and V2 logic, world, copy and scoping tests)
npm run e2e         # V1 Playwright suite (unchanged)
npm run e2e:v2      # V2 Playwright suite (builds to dist-v2, serves on 4279)
```

Browser setup is the repo's own (`npx playwright install chromium`; the V2 suite is chromium only).

## What is where

| Path | Purpose |
| --- | --- |
| `app/v2.html`, `app/vite.v2.config.ts` | Separate entry and build (own port and output); V1's `vite.config.ts` is not edited |
| `app/src/design-lab/v2/` | The lab: `screens/`, `components/`, `navigation/`, `logic/`, `fixtures/world.ts` (the one shared world), `i18n/`, `styles/` |
| `app/src/design-lab/v2/PRODUCT.md`, `DESIGN.md` | Product record and the V2 design system as shipped |
| `app/e2e-v2/` | V2 browser tests |
| `docs/design-lab/v2/reference/` | The four owner reference images under the owner's names |
| `docs/design-lab/v2/screenshots/` | `v2/` (renders), `v1/` (current frontend), `side-by-side/` (reference left, V2 right), `wip/` (working captures) |
| `docs/design-lab/v2/tools/` | `capture.mjs`, `capture-v1.mjs`, `compare.py` (the measurements below) |
| `docs/design-lab/v2/comparison.md` | The owner-reviewable V1 vs V2 vs reference comparison |
| `.claude/skills/` (untracked) | Local copies of the impeccable, hallmark and frontend-design skills, so Claude Code in this worktree finds them |

## Isolation

V2 is a separate HTML entry with its own stylesheet import, so V1 CSS cannot reach V2 and the reverse. Shared code is TypeScript only (contract rules, the INV-DEMO-7 fixture, persona view rules). Tests assert: no V1 selector in V2 assets, no V2 selector in V1 assets, every V2 component rule under `.kv2-`, no literal colours outside the token file, no network, storage or secrets in V2 source.
