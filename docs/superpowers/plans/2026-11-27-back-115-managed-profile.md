# BACK-115 Managed Postgres Profile and Idle-Safe Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `deploy/pilot` run against a managed Postgres (Neon `kawalys-pg18`) with no bundled database, and stop background health checks from keeping a serverless database awake, while the bundled-Postgres profile and its smoke keep passing.

**Architecture:** The container healthcheck moves from `/health` (database readiness, queries both pools) to `/process` (process liveness, no database). `/health` stays the truthful readiness answer and becomes an explicit deploy/upgrade gate. A second, standalone Compose file `deploy/pilot/compose.managed.yml` runs `web` + `bff` + on-demand `ops` only, with the three database URLs injected whole from the env file. Pools close idle connections after a fixed 10 s, so nothing holds the database open.

**Tech Stack:** Docker Compose v2, NestJS BFF (`server/`), node-postgres, Jest + Testcontainers (PostgreSQL 18.7), Bash smoke.

**Spec:** Jira BACK-115 (DEP-03), plus `docs/planning/BACK-114/neon-pg18-readiness.md` sections 4, 6 and 9.

## Global Constraints

- No live deployment, no new provider dependency, no change to production auth; no weakening TLS or security to fix compatibility (BACK-115 Stop).
- Local PostgreSQL 18.7 smoke (`bash deploy/pilot/smoke.sh`) must still end with `SMOKE RESULT: ALL PASS`.
- Managed config publishes no DB or BFF port; only `web` publishes 80/443. No secret in any committed file.
- Runtime URLs require `sslmode=verify-full` (already enforced by `server/src/config/database-config.ts`; do not relax). The admin URL must be the direct endpoint (already enforced by `db-admin-config.ts`).
- No duplicate CI pipeline: new checks go into `smoke.sh` and the existing Jest suites.
- Unknown is never healthy: nothing may report ready without a passing database probe.

## Review Focus

- Database down while the BFF is up: liveness 200, `/health` 503, protected routes still deny (no fake healthy). Owned by Task 1 (existing smoke checks kept, plus the compose assertion).
- Wrong password on a runtime URL: `/health` must answer 503, never 200 or 500 with detail. Owned by Task 1 (new readiness test).
- Managed env file missing a URL: `docker compose config` must fail with the variable's name, not start with an empty URL. Owned by Task 2 (`:?` interpolation + smoke check).
- Operator pastes a pooled (`-pooler`) host into the admin URL: `ops` must refuse (existing `db-admin-config` rule). Owned by Task 2 (smoke config check asserts the variable is passed through unchanged; the refusal itself is already unit-tested).
- Idle pool after traffic: connections must drop to zero within the idle timeout so the provider can suspend. Owned by Task 1 (pool test).

---

### Task 1: Liveness healthcheck, idle pool timeout, readiness on bad credentials

**Files:**
- Modify: `server/src/db/open-database.ts` (pool options)
- Modify: `deploy/pilot/compose.yml` (bff `healthcheck.test`)
- Modify: `deploy/pilot/smoke.sh` (one static check)
- Test: `server/test/db/open-database.spec.ts`, `server/test/health/readiness.spec.ts`

**Interfaces:**
- Produces: `export const POOL_IDLE_TIMEOUT_MS = 10_000;` in `server/src/db/open-database.ts`; both pools created with `idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS`.

- [ ] **Step 1: Write the failing tests**

In `open-database.spec.ts` (uses the existing Testcontainers helpers):
```ts
it('closes idle connections so a serverless database can suspend', async () => {
  // open with a real KawalysDb, run one query on each pool, then:
  expect(db.appPool.options.idleTimeoutMillis).toBe(POOL_IDLE_TIMEOUT_MS);
  expect(db.authPool.options.idleTimeoutMillis).toBe(POOL_IDLE_TIMEOUT_MS);
  expect(POOL_IDLE_TIMEOUT_MS).toBe(10_000);
});
```
In `readiness.spec.ts`, new `describe('GET /health (wrong runtime password)')`:
```ts
it('answers 503 ready:false with only service and ready', async () => {
  // build the app with appUrl whose password is wrong (real container), GET /health
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ service: 'kawalys-bff', ready: false });
});
```
If `openDatabase` refuses to start with a wrong password (boot role check), assert that refusal instead and name the test `refuses to start with a wrong runtime password` — either way no 200 and no error detail in the body.

- [ ] **Step 2: Run them, expect FAIL** — `cd server && npx jest test/db/open-database.spec.ts test/health/readiness.spec.ts` (fails: `POOL_IDLE_TIMEOUT_MS` not exported).

- [ ] **Step 3: Implement** — export the constant and pass `idleTimeoutMillis` in `pool()`. In `compose.yml` change the bff healthcheck to `wget -qO- http://127.0.0.1:8787/process`, and add a comment: liveness only, so a background check never queries the database (BACK-115); readiness is `/health`, checked at deploy.

- [ ] **Step 4: Smoke static check** — in `smoke.sh` near the other config checks add:
`check "bff container healthcheck uses liveness (/process), not the database probe" grep -q "8787/process" "$HERE/compose.yml"` and the negative `! grep -q "8787/health" "$HERE/compose.yml"` as a second check.

- [ ] **Step 5: Run** — the two Jest files PASS; `cd server && npm run typecheck` clean.

- [ ] **Step 6: Commit** — `feat: liveness container healthcheck and idle pool timeout so Neon can suspend (BACK-115)`

### Task 2: Managed Compose profile

**Files:**
- Create: `deploy/pilot/compose.managed.yml`, `deploy/pilot/env.managed.example`
- Modify: `deploy/pilot/smoke.sh` (config-only checks; no managed containers are started)

**Interfaces:**
- Consumes: Task 1's `/process` healthcheck.
- Produces: env names `KAWALYS_DATABASE_URL_APP`, `KAWALYS_DATABASE_URL_AUTH`, `KAWALYS_ADMIN_DATABASE_URL` (whole URLs), plus the same non-DB names as `env.example`.

- [ ] **Step 1: Write the smoke checks first** (they fail: file missing). Using a throw-away env file in `$TMP` with dummy values (`postgresql://u:p@db.example.invalid/kawalys?sslmode=verify-full`), run `docker compose -f compose.managed.yml --env-file "$TMP/managed.env" config` and assert:
  - config succeeds;
  - services are exactly `bff`, `web` (and `ops` under `--profile ops`); no `postgres`, no `pki`;
  - no volume named `pg-data`, `pg-tls` or `pki-ca`;
  - `bff` has no `ports`; `web` publishes 80 and 443 only;
  - bff healthcheck contains `8787/process`;
  - with `KAWALYS_DATABASE_URL_APP` removed from the env file, config fails and the error names `KAWALYS_DATABASE_URL_APP`.

- [ ] **Step 2: Write `compose.managed.yml`** — standalone file, project name default `kawalys-pilot`. `bff` and `web` keep every hardening line from `compose.yml` (non-root, `cap_drop: [ALL]`, `no-new-privileges`, `read_only` for web, trust-proxy subnet, allowed origins, NODE_ENV fail-closed default, Descope vars). Differences only: no `depends_on: postgres`, no `pg-tls` mount, no `NODE_EXTRA_CA_CERTS` (the provider's certificate chains to public roots; proven on Neon in BACK-114 §9), and `KAWALYS_DATABASE_URL_APP/AUTH: ${...:?set ... in .env.pilot}`. `ops` (profile `ops`) takes `KAWALYS_ADMIN_DATABASE_URL` and the three role passwords. Header comment: when to use which file, and that a provider with a private CA needs an override that mounts its CA and sets `NODE_EXTRA_CA_CERTS`.

- [ ] **Step 3: Write `env.managed.example`** — names only, same comments style as `env.example`; the three URL lines say: runtime URLs may use the provider's pooled host, admin URL must be the direct host, all `sslmode=verify-full`.

- [ ] **Step 4: Run** — `bash deploy/pilot/smoke.sh` ends `SMOKE RESULT: ALL PASS` (bundled profile unchanged plus the new config checks).

- [ ] **Step 5: Commit** — `feat: managed Postgres Compose profile for the pilot (BACK-115)`

### Task 3 (controller, not a subagent): measurement and runbook

Done by the controller because it uses the Neon credentials.

- [ ] Run the built BFF locally against `kawalys-pg18` (runtime URLs from Neon, never written to the repo): measure `/health` latency warm, and after an explicit compute suspend (wake-up); confirm that with only `/process` being polled the compute suspends after 300 s; confirm `/health` answers 503, not 200, when the URL password is wrong.
- [ ] Rewrite runbook section 11 as the managed procedure: provision/migrate (direct URL), deploy (`compose.managed.yml`), readiness gate (`curl -fsS https://<site>/api/health` must be 200 before declaring the deploy done), backup/restore (provider point-in-time restore, as drilled in BACK-114), rotation (provider API, then update `.env.pilot` and `up -d bff`), rollback. Record the measured numbers and the cost trade-off.
- [ ] Commit `docs: managed Postgres runbook and measured idle behaviour (BACK-115)`.
