# BACK-117 (DEP-05): pilot deployment execution plan, 27 Nov 2026

Status: **preflight done, plan for owner approval. No DNS change, no image published, nothing deployed.** The Descope and DNS facts below come from read-only calls. The repo artifacts come from this PR (section 3). Nothing here runs until the owner approves each gated step.

## 1. Where things stand

| Area | State (read 27 Nov 2026) |
| --- | --- |
| Host | Lightsail `kawalys-pilot`, Frankfurt, static IP **63.189.76.76**. **Owner-verified:** bootstrap done, Docker Compose 2.40.3, Docker active, x86_64, 1.9 GiB RAM (1.4 GiB available), no swap. Firewall: 22 from Lightsail browser SSH only; 80 and 443 open. |
| Database | Neon `kawalys-pg18`, PostgreSQL 18.7, provisioned, migrated, isolation 22/22, restore drilled (BACK-114). Runtime passwords live in Neon. |
| Domain | Approved: **kawalys.kemetralabs.com**. The `kemetralabs.com` zone is on Cloudflare (nameservers `alice` and `lennox.ns.cloudflare.com`). `kawalys.kemetralabs.com` does not exist yet (NXDOMAIN). The Cloudflare plugin needs a re-sign-in (`/mcp`, zone read and DNS edit) before the agent can read or change the zone. |
| Images | Repo `Kemetra-Labs/Backstage-OS` is **public**, so GHCR images can be public and the host needs **no pull token**. Images hold no secrets; the smoke checks there is no `.env` inside them. |
| Descope | A project named **"Kawalyse"** exists (`P3MW4c80PMtyApvtGSONYmXy9fGt`). It is unconfigured: no app URL, no approved domains, magic link off, passkeys off. Session token 10 min, refresh 30 days, refresh rotation off. |
| Real sign-in | **D3(a) built in the repo, never run against Descope (P5 not done).** The lab page still refuses to run in production; the app now has a live-mode `/sign-in` page (Descope magic link, one exchange, SDK logout, storage clear). Its CSP is **report-only**; enforcing waits for the first real sign-in with no violations. Still open: the owner sets App URL and Approved Domains = `kawalys.kemetralabs.com` in the Descope console (the connector cannot), the proprietary-licence transitive dependency `@fingerprintjs/fingerprintjs-pro@3.11.6` is accepted by the owner 2026-11-27 as Descope's responsibility (transitive dependency of @descope/web-component), and after the first sign-in the owner checks that Application, Local Storage and Session Storage hold no Descope keys. Runbook: `docs/planning/BACK-64/pilot-deployment-runbook.md` section 5a. |
| **Production start requirement** | In production the BFF **refuses to start** unless both `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` are set (`server/src/auth/auth.config.ts`, fail closed). The project id is known ("Kawalyse", a public identifier). The owner subject is the owner's Descope user id **in that project**. It does not exist yet: the owner's user must be created in "Kawalyse" first (step 4a). Neither value is a secret. |

## 2. Recommendations (labelled, owner decides)

- **Registry:** public GHCR images built by `.github/workflows/images.yml`, started by hand from `main`. Images are referenced by **digest** only.
- **Depot:** skip it for now. Two images on `ubuntu-latest` are small. Depot Container Builds (benchmark capped at 60 minutes, BACK-116 section 4) can be measured later if build time matters.
- **Origin TLS:** Cloudflare proxied record, SSL **Full (strict)**, "Always Use HTTPS" on, minimum TLS 1.2. Caddy gets its own Let's Encrypt certificate through the HTTP challenge, which Cloudflare passes through. Then restrict Lightsail 80/443 to Cloudflare's ranges.
- **Secrets on the host (BACK-58):** `/opt/kawalys/.env.pilot`, owned by `ubuntu`, mode `0600`, outside the git checkout. It holds the two runtime URLs (from the Neon console) and the image digests. No admin URL is kept after `ops`.
- **Descope:** use the existing "Kawalyse" project. Rename it to "Kawalys" in the console if wanted; the project id does not change. Configuration happens with D3(a) (step 9), not before.
- **Swap:** add a 1 GiB swap file on the host. It's cheap insurance for a 2 GB machine with no swap.

## 3. Prepared in this PR (merging needs owner approval: it adds a CI workflow)

1. `deploy/pilot/compose.deploy.yml`: overrides `compose.managed.yml` so `bff` and `ops` run one image and `web` another, each `image@sha256:...` from the env file, with no `build:`. The host never builds.
2. `deploy/pilot/Caddyfile`:
   - `trusted_proxies` with `client_ip_headers CF-Connecting-IP`, and `X-Forwarded-For` set to `{client_ip}`.
   - The proxy list comes from `KAWALYS_TRUSTED_PROXIES` (Cloudflare's published ranges). It defaults to loopback, so local behaviour and the forgery checks are unchanged.
   - Behind Cloudflare, the BFF's per-client sign-in limit then sees the real client.
3. `.github/workflows/images.yml`:
   - **Manual only** (`workflow_dispatch`) and only from `main`. It builds both Dockerfiles for `linux/amd64`, with provenance and an SBOM.
   - It pushes to `ghcr.io/kemetra-labs/kawalys-{bff,web}:<sha>` and writes the digests to the run summary.
   - It uses only `GITHUB_TOKEN`, with `packages: write`. No runtime secret ever reaches a build.
4. Smoke checks for all three. The smoke still ends `SMOKE RESULT: ALL PASS`.

## 4. Execution steps (each gated; nothing runs without "go" for that step)

| # | Step | Who | Gate |
| --- | --- | --- | --- |
| 1 | Merge this PR | agent | **Owner approves the CI workflow** |
| 2 | Run `images.yml` on `main`; record both digests; make the two GHCR packages public (`Kemetra-Labs` → Packages → each package → visibility) | agent runs the workflow; owner sets visibility, or approves the agent doing it | **Owner approves publishing** |
| 3 | Cloudflare: create **only** `A kawalys.kemetralabs.com → 63.189.76.76`, **DNS-only (not proxied)**. **No AAAA record:** the Compose network is IPv4-only, so IPv6 traffic would reach Caddy from the Docker gateway address. The real client address would be lost and every IPv6 visitor would share one sign-in limit. | agent, after `/mcp` re-auth | **Owner approves the DNS change** |
| 4a | Descope: create the owner's user in "Kawalyse" (or the owner creates it in the console) and record its user id as `KAWALYS_OWNER_SUBJECT`. Self sign-up stays off. | owner, or agent with approval | **Owner approves the Descope change** |
| 4 | Host prep over browser SSH: 1 GiB swap; `/opt/kawalys` with the repo's `deploy/pilot` files at the approved commit; `.env.pilot` (0600) with site address, runtime URLs from Neon, image digests, `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` (step 4a), `KAWALYS_TRUSTED_PROXIES` from cloudflare.com/ips. Then `bash deploy/pilot/preflight-deploy.sh .env.pilot` must pass: it rejects any image that is not `@sha256:<digest>`. | owner pastes the commands the agent provides; secrets are typed by the owner only | Owner |
| 5 | Deploy: `dcm -f compose.deploy.yml pull`, then `up -d bff web`, then the **readiness gate** (runbook 11) against `https://kawalys.kemetralabs.com`. Caddy obtains its certificate directly (DNS-only). `NODE_ENV` is production with Descope configured, and the app has no sign-in until D3(a), so every protected route stays deny-all. |
| 5b | Verify the origin certificate (`curl -v https://kawalys.kemetralabs.com/api/health`: a Let's Encrypt chain). Only then switch the record to **proxied**, set SSL **Full (strict)** and Always Use HTTPS, and run the readiness gate again through Cloudflare. | agent | **Owner approves the proxy switch** | agent writes the commands; owner runs them in browser SSH | **Owner approves deploy** |
| 6 | Verify from outside: HTTPS and the certificate chain; `/api/health` 200 `ready:true`; `/api/process`; protected routes 404; security headers; no 5432 or 8787 reachable; Neon idle and wake; `docker stats` and `free -m` headroom | agent | none (read-only) |
| 7 | Narrow the Lightsail firewall: 80/443 to Cloudflare ranges only | agent | **Owner approves** |
| 8 | Rollback: record the first verified digest pair as the **baseline** in BACK-117. The drill runs at the **second** release: deploy the new pair, then put the baseline pair back in `.env.pilot`, `up -d`, and pass the readiness gate. The database restore drill is already done on Neon. | agent and owner | Owner |
| 9 | **D3(a)**: build the Descope sign-in in the app (new dependency), configure "Kawalyse" with approved domain `kawalys.kemetralabs.com`, the sign-in flow and methods, self sign-up off; set `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT`; owner signs in (P5) | agent builds; owner decides and signs in | **Owner: D3(a) and Descope changes** |
| 10 | Evidence bundle for BACK-51: R1–R4, X02/X04, BACK-30 reconciled; unrun checks marked honestly | agent | Owner signs off |

Steps 1 to 8 give a real, HTTPS, database-ready, deny-all pilot. Step 9 is what makes it usable.

## 5. Risks and limits

- **Wake-up latency** (1.78 s measured) is close to the 2 s readiness probe; the gate retries.
- **Origin certificate:** with the record proxied from the start, Caddy's HTTP challenge still works through Cloudflare, but a Cloudflare redirect rule could block it. Starting DNS-only avoids the question.
- **Memory:** 1.4 GiB available before the stack starts. Measure after step 5 and report before any tier change.
- **Cost:** about $16–19/month, currently covered by credits. The AWS budget is already about 63% used in November from other usage.

## 11. Execution record, 27 Nov 2026 (Origin CA, host measurements, rollback drill)

**Origin CA (owner-approved).** Release 2 (`05ad01b`) `web` is deployed. A Cloudflare Origin CA certificate for `kawalys.kemetralabs.com` is mounted through `compose.origin-cert.yml`. The private key was created on the host and never left it. Certificate id `369951370120849616063248932064496707687717040930`; **expires 2029-11-26; nothing renews it.** Verified: certificate matches key; the served issuer is the Cloudflare Origin CA; Caddy logs `skipping automatic certificate management`; through Cloudflare `/api/health` is `ready:true` with a verified certificate, a protected route is 404, port 80 redirects. This closes the January 2027 Let's Encrypt renewal risk.

**Access used.** The host was reached by temporary SSH from the agent's machine: port 22 opened to one `/32` with `OpenInstancePublicPorts`, a short-lived key from `GetInstanceAccessDetails`, then the exact original rules restored with `PutInstancePublicPorts` (22 from `lightsail-connect` only; 80 and 443 from the Cloudflare ranges only) and the key deleted. Done twice (certificate step, then measurements and drill). Firewall verified after each.

**Compose files.** Every host command uses **three** `-f` files. With only `compose.managed.yml` and `compose.deploy.yml`, `web` loses the certificate mount and Caddy returns to automatic certificates.

**Host measurements (18:47 UTC, stack up, idle).**

| Item | Value |
| --- | --- |
| Memory | 1905 MB total, 592 used, 1313 available |
| Swap | 1 GiB swapfile, 52 KB used |
| Disk | 4.1 GB of 58 GB (8%) |
| Load | 0.01 |
| `web` container | 10 MiB |
| `bff` container | 41 MiB |

Headroom is large for a deny-all pilot. Not measured: memory under real use (nothing signs in until D3(a)). No tier change is needed.

**Neon idle (agent, Neon API).** With the full stack live (BFF container healthcheck polling `/process`), the last compute activity was 18:47:57 UTC, after the drill's readiness checks. The compute for `ep-spring-wind-bgn9u8ez` went `idle` and was suspended at **18:53:30 UTC**, about 5 minutes later (`suspend_timeout_seconds` 300). So the liveness-only healthcheck does let Neon suspend in the deployed pilot; only readiness calls (`/api/health`) and real traffic keep it awake. The wake cost was measured earlier (1.78 s, BACK-115).

**Rollback drill (BFF only).** Baseline release 1 BFF `sha256:2aa5d074…`; moved to release 2 BFF `sha256:2e46b2a4…` (preflight passed, `ready:true`), then back to release 1 from the env backup: ready again 16 s after the command, origin certificate unchanged. The drill ended on release 1, the pre-drill state. `web` is deliberately not rolled back: release 1 `web` has no `tls.d` import and would switch Caddy back to Let's Encrypt. **Rollback floors: bff release 1, web release 2.** Database restore was drilled earlier (BACK-114).

**Still open after this record:** D3(a) sign-in (owner decision), P5 real Descope run, rulings R1 to R4, X02/X04/BACK-30 reconciliation, evidence bundle and the owner's BACK-51 sign-off; BACK-58 secret custody (0600 env file today); rotation of the two database passwords that appeared in chat; the AWS connection is still root.
