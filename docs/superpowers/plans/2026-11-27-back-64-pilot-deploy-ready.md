# BACK-64 pilot deployment, deploy-ready artifacts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the owner needs to run the Kawalys pilot on one non-local Linux host is in the repo and proven locally: images, a Compose stack, a readiness endpoint, a runbook. Nothing is deployed, no host is chosen, no secret is created.

**Architecture:** "Docker Compose on one VM", the first option BACK-64 lists, provider-agnostic. Three services on a private Compose network: `postgres` (no published port), `bff` (the existing server, built into a non-root image, listening on the private network only), and `web` (Caddy serving the live-mode app build and reverse-proxying `/api/*` to the BFF with the prefix stripped, which is the same-origin model of owner decision D2 (a)). Caddy terminates HTTPS, which the `__Host-` `Secure` session cookie needs on any non-localhost name. Database roles and migrations reuse the existing operator command `server/src/ops/db-admin.ts`, run as a one-shot container.

**Tech Stack:** Docker / Compose v2, `node:24-alpine`, `postgres:17-alpine` (already used), `caddy:2` (new, pinned to an exact version), NestJS BFF, Vite.

**Spec:** Jira BACK-64 acceptance criteria and the 22 Nov reconciliation note (quoted in `docs/planning/BACK-51/demo-script-and-limits.md`); `docs/planning/BACK-51/gate-path-plan.md` §5 ("Same origin is mandatory", "Deployed, HTTPS is required").

## Global Constraints

- BACK-64 AC: deployment method documented; health endpoint returns 200 when services are up; at least one non-local environment can run the pilot; secrets are not in the image or repo.
- No real secret, URL, host name or account anywhere in the repo. Env files are gitignored; only a names-only template is committed.
- No npm dependency added. New container images are pinned to exact versions.
- Default behaviour unchanged: without the new env var the BFF still binds `127.0.0.1` only; the default app build and every existing suite are unchanged.
- The BFF port is never published by Compose; only `web` publishes 80/443.
- Unknown is never Healthy: the readiness endpoint says `ready` or `not_ready`, never "healthy", and reveals nothing but that.
- No CI change in this plan (a deploy-smoke CI job is a recorded follow-up).
- Local commits on the feature branch only; push/PR/merge by the controller.

## Review Focus

1. **The BFF bound to `0.0.0.0` on the host network by mistake** → it must only be reachable through Caddy. Compose must not publish 8787; test by `docker compose port` showing nothing for bff.
2. **Readiness lies** → with Postgres stopped, `/api/health` must answer 503 within a bounded time, not hang and not 200.
3. **Cookie broken behind the proxy** → `__Host-` needs HTTPS and no `Domain`; the local smoke uses `https://localhost` via Caddy's internal CA and must show the deny-all 404 (Descope unset), proving the request reached the BFF through the proxy.
4. **Secrets leak into an image** → `.dockerignore` excludes `.env*`, `.local-stack/`, `node_modules`, `dist-*`; a smoke step greps the built image filesystem for `KAWALYS_DATABASE_URL` values.
5. **Migrations run by the service** → the runtime never migrates; only the one-shot operator container does (`db-admin migrate --apply`), as today.

---

### Task 1: BFF bind host and readiness endpoint

**Files:**
- Modify: `server/src/main.ts` (bind host from `KAWALYS_BFF_HOST`, default `127.0.0.1`)
- Create: `server/src/config/bind-host.ts` (pure parser) + `server/test/config/bind-host.spec.ts`
- Create: `server/src/health/readiness.controller.ts` + register it where `ProcessController` is registered
- Test: `server/test/health/readiness.spec.ts` (Testcontainers DB: up → 200, pools ended → 503) and a no-database case

**Interfaces:**
- Produces: `bindHost(env): string` — returns `'127.0.0.1'` when unset; accepts only `'127.0.0.1'`, `'::1'`, `'0.0.0.0'`; anything else throws a config error naming the variable (never the value).
- Produces: `GET /health` (public, no session): with a database configured, runs `SELECT 1` on the app and auth pools with a 2 s timeout each → `200 {"service":"kawalys-bff","ready":true}`; any failure or timeout → `503 {"service":"kawalys-bff","ready":false}`. Without a database configured → `503 {"ready":false}` (the pilot needs one). No error text, no pool names, no timings in the body.

- [ ] Step 1: failing tests for `bindHost` (unset, each allowed value, `'10.0.0.5'` throws, message contains `KAWALYS_BFF_HOST` and not the value) and for `/health` (up 200, DB unreachable 503 within 5 s, no DB 503, body keys exactly `service` and `ready`, route reachable with no cookie).
- [ ] Step 2: run them, see them fail.
- [ ] Step 3: implement; `main.ts` uses `bindHost(process.env)`; keep its fixed-message error handling (a bind-host config error prints the variable name only).
- [ ] Step 4: `cd server && npm run typecheck && npm test -- test/config/bind-host test/health` pass.
- [ ] Step 5: commit `feat: configurable BFF bind host and readiness endpoint (BACK-64)`.

### Task 2: Images, Compose stack and local smoke

**Files:**
- Create: `deploy/pilot/server.Dockerfile` (multi-stage: build with dev deps, runtime `node:24-alpine` with `npm ci --omit=dev --ignore-scripts`, copies `dist/` and `migrations/`, `USER node`, `CMD ["node","dist/main.js"]`)
- Create: `deploy/pilot/web.Dockerfile` (stage 1 builds `app/` with `VITE_KAWALYS_LIVE=1`; stage 2 `caddy:<exact>` with the build in `/srv` and the Caddyfile)
- Create: `deploy/pilot/Caddyfile` (`{$KAWALYS_SITE_ADDRESS}`; `handle_path /api/*` → `reverse_proxy bff:8787`; everything else `file_server` with SPA fallback to `index.html`; security headers: HSTS, `X-Content-Type-Options nosniff`, `Referrer-Policy no-referrer`, `X-Frame-Options DENY`)
- Create: `deploy/pilot/compose.yml` (services `postgres`, `bff`, `web`; private network; `postgres` and `bff` publish no ports; `bff` env `KAWALYS_BFF_HOST=0.0.0.0` plus the KAWALYS_* runtime vars from `env_file: .env.pilot`; healthchecks: postgres `pg_isready`, bff `wget -qO- http://127.0.0.1:8787/health`; `web` depends on bff healthy; named volumes for pg data and Caddy data)
- Create: `deploy/pilot/env.example` (every variable name the stack reads, empty values, one comment each; no example secrets)
- Create: `.dockerignore` at the repo root (`**/node_modules`, `**/.env*` except `env.example`, `server/.local-stack`, `**/dist*`, `.git`, `.superpowers`, `test-results`)
- Create: `deploy/pilot/smoke.sh` (bash; brings the stack up with `KAWALYS_SITE_ADDRESS=localhost` and a throwaway generated `.env.pilot` in a temp dir, runs provision + migrate via `docker compose run --rm bff node dist/ops/db-admin.js … --apply`, then checks and prints PASS/FAIL per line, then `down -v`)
- Modify: root `.gitignore` if `deploy/pilot/.env.pilot` is not already covered (`.env.*` already is — verify).

**Interfaces:**
- Consumes: Task 1's `KAWALYS_BFF_HOST`, `GET /health`; existing `db-admin` env (`server/src/ops/db-admin-config.ts` — read it for the exact variable names) and runtime `KAWALYS_DATABASE_URL_APP` / `_AUTH`.
- Smoke checks (all must PASS): `https://localhost/api/process` 200; `https://localhost/api/health` 200 after migrate; `https://localhost/` serves the app (HTML contains the app root element); `https://localhost/api/portfolio` 404 `not_found` (deny-all: Descope unset); `docker compose port bff 8787` prints nothing; `docker compose port postgres 5432` prints nothing; after `docker compose stop postgres`, `/api/health` 503 within 10 s; no `.env` file and no generated password string found in either built image (`docker run --rm --entrypoint sh <img> -c 'grep -r …'` or `docker image save | tar` scan).

- [ ] Step 1: write `smoke.sh` first (it is the test); run it, see it fail (no files yet).
- [ ] Step 2: write the Dockerfiles, Caddyfile, compose, env.example, .dockerignore.
- [ ] Step 3: run `bash deploy/pilot/smoke.sh` until every line PASSes (Docker is running locally). Use `curl -k` against Caddy's internal CA for localhost.
- [ ] Step 4: confirm no change under `app/src`, `app/e2e*`, and that `cd app && npx tsc --noEmit` still passes.
- [ ] Step 5: commit `feat: pilot Compose stack, images and local smoke (BACK-64)`.

### Task 3: Runbook and docs

**Files:**
- Create: `docs/planning/BACK-64/pilot-deployment-runbook.md`
- Modify: `docs/planning/BACK-51/demo-script-and-limits.md` (BACK-64 row: "Deploy-ready, proven locally by `deploy/pilot/smoke.sh`; non-local run NOT RUN (owner: host + secrets)"), `CLAUDE.md` (one line under Run and test: the smoke command; the hard-rules sentence about the backend gains "deploy artifacts in `deploy/pilot/`, nothing deployed"), `server/README.md` (the two new env vars).

The runbook covers, in order: prerequisites the owner provides (a Linux VM with Docker, a DNS name, a managed or self-hosted Postgres choice, the Descope project from P5); first install (copy `env.example` to `.env.pilot` on the host, fill values, `docker compose up -d postgres`, provision, migrate, `up -d`); the Descope redirect URL for the deployed origin (`https://<name>/api/auth/lab` is local-only and refused in production; production sign-in needs D3 (a), the Descope web SDK, which is a separate owner-approved change); verify (`/api/health`, deny-all before owner config); upgrade; backup/restore of the pg volume (`pg_dump` as the admin role); rollback (previous image tag); rotate secrets; teardown. Every step says who does it. Mark plainly: nothing here was run against a real host.

- [ ] Step 1: write the runbook and doc edits.
- [ ] Step 2: run every command in the runbook that can run locally (it may reuse `smoke.sh`); list the ones that cannot (DNS, real cert, real Descope) as owner-run.
- [ ] Step 3: commit `docs: BACK-64 pilot deployment runbook`.
