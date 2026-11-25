# BACK-60 (MVP-11): testing strategy, unit + integration + contract

Status: written 2026-11-25 against `main` `ba3a713` plus the BACK-53/54/59/61/62 slices of the same day.
It audits what exists; per the 22 Nov reconciliation it adds no duplicate pipeline (CI is BACK-63/BACK-93).

## Baseline numbers (counted, not estimated)

| Suite | Where | Runner | Count | Needs |
| --- | --- | --- | --- | --- |
| Root prototype | `tests/` (`smoke.spec.js`, `findings.spec.js`) | Playwright, chromium + webkit | all screens × 320–1440 px × personas × EN/AR × source states | a static server (started by the config) |
| App unit + typecheck | `app/src/**/*.test.ts` | Vitest + `tsc --noEmit` | 940 tests, 54 files | Node only |
| App V1 e2e | `app/e2e/*.spec.ts` | Playwright, chromium + webkit (3 shards) | 33 spec files | `vite build` + preview |
| Server | `server/test/**/*.spec.ts` | Jest (ESM) + `tsc` | 598 tests, 39 suites | **Docker** (disposable `postgres:17-alpine` via testcontainers; no skip) |
| G1 scorer | `docs/planning/G1/` | self-check script | n/a | Node |

All of them run in CI (`.github/workflows/ci.yml`), selected by `.github/scripts/classify-changes.sh`. Only the
`gate` job is required on `main`.

## How the acceptance criteria are met

| BACK-60 criterion | Met by |
| --- | --- |
| Test command exists and passes on a clean checkout | `npx playwright test` (root), `npm run check` in `app/` and in `server/`. All three pass on a clean checkout. `server/` needs a Docker daemon (a cloud container can start one with `dockerd`). |
| ≥ 1 integration test, connector → stored Observation | `server/test/connectors/github/github-ingest-db.spec.ts`: GitHub observer (canned transport) → `EvidenceRepository` → real Postgres with RLS → read back. Jira/Confluence (BACK-53) stop at the mapper: `sources.provider` only allows `github` (migration 0003). |
| Frontend checks the API response shape | Response-shape parity: `server/test/portfolio/portfolio-parity.spec.ts` builds `GET /portfolio` bodies through the real read model and requires them to equal `app/src/fixture/portfolio-*.json`. The app side (`app/src/api/*.test.ts`) requires those fixtures to parse with nothing malformed or dropped. `api.guard.test.ts` keeps request code out of `app/`. |
| CI (or a local script) runs the tests | Impact-aware CI (BACK-93), every PR. |

## Test layers and what each must prove

1. **Contract rules (pure, fastest).** `app/src/contract/rules.ts` and `server/src/evidence/evidence.types.ts`: Unknown is
   never Healthy, labels never promote (`app/src/contract/noPromotion.test.ts`, BACK-54), counts never show a false exact
   number. Add a test here first for any new truth rule.
2. **Adapters and mappers (pure).** Server JSON → display contract (`app/src/api/`); connector answers → Observations
   (`server/src/connectors/*`). Each mapping gets malformed, missing-field, oversized, non-https and unknown-enum cases.
3. **Repository + database (integration).** Real Postgres, real roles: RLS, grants, append-only triggers, audit rows in
   the same transaction, cross-workspace and no-grant negatives. Never mock the database for a security property.
4. **HTTP (integration).** Nest app in process: deny-by-default, 401/403 reported as 404, `validation_error` envelope,
   capability required, persona header ignored.
5. **UI (e2e).** Each screen × persona × EN/AR (RTL) × width; source states down/stale; axe; no forbidden action verbs;
   no leak of restricted ids (`leaks.spec.ts`, `nondisclosure.spec.ts`).

## Rules for new work

- A fix lands with a test that fails against the old behaviour (root: extend `tests/findings.spec.js`).
- A guard test for an invariant that already holds is mutation-checked: break the rule on purpose and see it fail.
- Every security or visibility test has a negative twin (another workspace, no grant, missing capability, no session).
- No `test.skip`/`describe.skip` to get green; no quarantines.
- Copy changes update `app/src/i18n/__snapshots__/all-copy.json` deliberately; review that only the intended keys moved.

## Gaps (tracked as follow-ups, not fixed here)

| Gap | Why it matters | Proposed home |
| --- | --- | --- |
| No HTTP-level contract test between server responses and app fixtures for `GET /evidence`, `GET /investigations/:id`, `GET /decisions` | Only `/portfolio` has parity today; the evidence adapter could drift from the server | new ticket (parity for evidence/investigation/decision bodies) |
| Jira/Confluence observations cannot be stored | `sources.provider` CHECK allows `github` only | BACK-53 follow-up (schema slice, needs approval) |
| App Playwright pins 1.65.1; cloud containers ship another Chromium build | e2e needs an `executablePath` override outside CI | documented here; CI is unaffected |
| No load/perf baseline for the latest-read query | Portfolio scans each source's history (README, Deferred) | after an index decision |
