# BACK-51 pilot gate: evidence bundle for the owner's sign-off

**Status: evidence assembled for owner review. The gate is NOT signed off.** Every row below is PASS only where this page
cites evidence. Anything not proven says NOT RUN. The owner signs (section 7).

Collected 27 Nov 2026 (UTC) on `main` at `92989d1`, against the live pilot `https://kawalys.kemetralabs.com`. The agent
(Claude) ran the probes in sections 3 and 5. The owner performed the real sign-ins in section 2. Nothing here contains a
secret: the Descope project id is a public identifier; keys, DB passwords and tokens appear nowhere.

## 1. Verdict by gate row

Rows are those of the gate table in [demo-script-and-limits.md](demo-script-and-limits.md).

| Requirement | State | Evidence |
| --- | --- | --- |
| Login (real, production) | **PASS** | Owner signed in twice with a real Descope magic link on the deployed pilot (section 2). |
| Login → Portfolio → Investigation → record decision, end to end | **PARTIAL** | Whole path passes in CI (`live-e2e`, fake identity verifier, disposable Postgres). On the live pilot only sign-in and the signed-in shell are proven. The Neon database holds the schema and no seeded cases, so Portfolio, Investigation and "record a decision" on the live pilot are **NOT RUN** (owner decision O1). |
| Demo script (5–10 min) | NOT RUN with the owner | Written, not rehearsed ([demo-script-and-limits.md](demo-script-and-limits.md)). |
| Known limitations listed | PASS | Same file, updated 27 Nov for the deployed state. |
| X02/X04 + BACK-30 restricted-existence sign-off | **OWNER ONLY** | Evidence pack [x02-x04-back30-evidence.md](x02-x04-back30-evidence.md); rulings R1–R4 open. |
| BACK-55/56/57/59/60/61/62 readiness | PASS (code) | Merged; BACK-56 real sign-in now run (P5). |
| BACK-64 deployment | **PASS** | Deployed and probed (sections 3 and 4). Rollback proven (section 6). |
| Negative / privacy / EN-AR / RTL / a11y checks documented | PASS | In CI (app e2e: `a11y`, `leaks`, `nondisclosure`, `arabic-copy`; live e2e: negative, Arabic and leak cases). |
| Owner signs off | **NOT RUN (owner only)** | Section 7. |

## 2. Real sign-in (P5)

| What | Result |
| --- | --- |
| Flow | `/sign-in` (Descope web component 4.6.3, flow `sign-in`, magic link) → one `POST /api/auth/session` → Kawalys `__Host-` HttpOnly SameSite=Strict cookie → `GET /api/auth/me`. |
| First sign-in (release 4, CSP report-only) | Owner signed in. The first attempt failed with "email not verified" because the owner user had been created through the management API in status `invited`. It was patched to enabled + verified (same userId) and the second attempt succeeded. |
| Second sign-in (release 5, CSP **enforcing**) | Owner signed in with a fresh magic link. The browser pane shows "Signed in as the owner." on Command Home. |
| Browser storage (agent, built-in browser pane, signed in) | No Descope session or refresh token in `localStorage` or `sessionStorage`. Only three stale `descopeFlowNonce*` flow nonces (not credentials) and `dls_ab_testing_id`. JavaScript sees no cookies (the session cookie is HttpOnly). |
| Console, signed-in app page, CSP enforcing | Only Cloudflare's own bot-detection inline script is blocked (not ours), plus one unexplained HTTP 400 that is not a CSP block and was present before enforcement. |

## 3. Live probes, signed out (27 Nov, 22:48 UTC)

All made with `curl` from outside the host.

| Probe | Observed |
| --- | --- |
| `GET /api/health` | `{"service":"kawalys-bff","ready":true}` |
| `GET /api/auth/me`, `GET /api/evidence` (no session) | 404 `{"error":{"code":"not_found",...}}`, `Cache-Control: no-store` (deny by default, uniform not-found) |
| `POST /api/auth/session` with `Origin: https://evil.example` | 404 not_found (Origin guard, refused before the body is read) |
| `GET /api/auth/lab` | 404 (owner lab page refused in production) |
| `GET /api/demo/evidence/E-1` | 404 (demo route is off when a database is configured) |
| `http://` | 301 to `https://` |
| Direct to the origin IP `63.189.76.76:443` | No answer (firewall allows Cloudflare ranges only) |
| `GET /` headers | `strict-transport-security: max-age=31536000`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`, **enforcing** `content-security-policy` (`default-src 'self'; script-src 'self'; ... frame-ancestors 'none'; base-uri 'self'`) |
| `GET /sign-in` headers | Same, plus `Cache-Control: no-store`, and the `/sign-in` CSP that additionally allows `descopecdn.com` and `static.descope.com` (scripts) and `api.descope.com`, `static.descope.com`, `static2.descope.com` (connections). No Report-Only header remains. |

## 4. What is deployed

| Item | Value |
| --- | --- |
| Host | Lightsail `kawalys-pilot` (small_3_0, Ubuntu 24.04, eu-central-1a), static IP, behind Cloudflare (proxied, SSL Full strict, Origin CA certificate for the host, expires 2029-11-26; **nothing renews it, set a reminder**) |
| Firewall | 80/443: Cloudflare ranges only (15 IPv4 + 7 IPv6 CIDRs). 22: `lightsail-connect` only (no standing SSH; deploys use a temporary key and a single /32, restored afterwards) |
| Release 5 (current) | checkout `92989d1`; `kawalys-bff@sha256:5dd01e775932c1a112fba4dd71eb921c33016ab54a3eb3a375db5ab748404568`; `kawalys-web@sha256:d6876cadef8a45ab0f64a3c50fd543c9ee73e5cea90171151d9edee68645fb55`; Images run 46077601916; images public, pinned by digest, provenance and SBOM attached |
| Database | Neon project `kawalys-pg18` (PostgreSQL 18.7, Frankfurt, Launch plan). Isolation checks 22/22 pass; restore drill passed; the old PG17 project is deleted (recoverable until about 2026-12-04). |
| Identity | Descope project "Kawalyse": magic link; App URL and Approved Domains set; one owner user. Transitive `@fingerprintjs/fingerprintjs-pro` accepted by the owner as Descope's responsibility. |
| Cloudflare config rule (this host) | ssl strict, Rocket Loader off, Email Obfuscation off, Web Analytics off. Bot Fight's own JS-detection snippet still injects and is blocked by the CSP (harmless; optional to switch off). |

## 5. Releases and rollback

| Release | Deployed (UTC) | Notes |
| --- | --- | --- |
| 3 | 27 Nov 21:11 | First `/sign-in`. Blank page in production (React 19 set `locale` as a DOM property on a getter-only element). |
| 4 | 27 Nov 21:49 | Hotfix #170: element built imperatively. Sign-in worked. CSP report-only. |
| 5 | 27 Nov 22:38 | #171: CSP enforcing. Owner signed in under it. |

Rollback is proven, not assumed: the BFF rollback drill passed earlier, and every deploy ran with an env backup and an
automatic rollback. To roll back web, restore the previous digest in `.env.pilot` (backup on host
`.env.pilot.bak-20261127T223823Z` holds release 4), run `preflight-deploy.sh`, then `up -d web` with the three `-f` files.
Release 4 web: `sha256:58f356644715e2b30d379aa6d1be641617a9db0ad53a9320046539d58f7f3e87`.

## 6. CI at `92989d1`

- PR #171 gate: green on its head commit (all suites, SonarCloud: 0 new issues, 0 hotspots).
- Push run on `main` (`46077571113`): the jobs that run on Depot runners (`server`, `app-e2e` chromium and webkit x3) failed
  with **no steps and no runner assigned**, each after exactly 10 minutes: a runner-pool problem, not a code failure. The
  other five jobs (including `live-e2e`) passed. The failed jobs were re-run; result: see the line below.
- Re-run result (22:49-23:00 UTC): failed the same way, again with no runner assigned. The same four jobs passed on the
  previous main push (`d3e7652`, about an hour earlier), so the Depot runner pool is unavailable right now. **The code on
  `main` is verified by the PR gate (ubuntu-latest); the post-merge run on main is not green until the runners return or
  the kill switch is used (owner decision O3).**

## 7. Open items

**Owner decisions and sign-off**

| # | Item | Recommendation |
| --- | --- | --- |
| R1 | M2: investigations and uncited decisions are project-scoped user records (BACK-30 derivatives clause) | Option (a); the alpha has one source per project |
| R2 | L8: unsent drafts stay in memory after expiry (D3 (b)) | Accept; mention in pilot guidance |
| R3 | Sign-off scope is the Personal Alpha subset only | Confirm |
| R4 | Defer L1, L4, L5, L7 to gate D; real Descope verification and deployed HTTPS are now evidenced above | Approve |
| O1 | Live Portfolio/Investigation/decision path on the pilot needs data in Neon (synthetic seed, or wait for the real GitHub read slice) | Seed synthetic data once, then run the live walk with the owner |
| O3 | CI on `main` (push runs use Depot runners): the `server` and `app-e2e` jobs get no runner. The documented kill switch is the repository variable `DEPOT_RUNNERS=off` ([CI-DEPOT-RUNNERS.md](../../CI-DEPOT-RUNNERS.md)); then start a fresh `gh workflow run ci.yml --ref main` | Wait a short while and re-run once; if the pool is still down, set the variable (a repository setting, so your call) and re-run |
| O2 | Font on `/sign-in`: the CSP blocks the Descope font (cosmetic fallback font). Fix = add `descopecdn.com` to `font-src` on the `/sign-in` matcher | Bundle into the next release; not urgent |

**Operational follow-ups (not gate rows)**

- BACK-128: rotate the two Neon DB passwords that were shown in chat.
- BACK-116: replace the root AWS connection with a least-privilege identity.
- Reminder before the Origin CA certificate expires on **2029-11-26** (nothing renews it).
- Not tested: the magic link opened in a second tab; stale `descopeFlowNonce*` keys are left behind.
- Deferred server findings: F-004 (no one-time use of the Descope session JWT), F-005 (no sign-out-everywhere UI), F-006 (limiter /128 prefix).
- Limits that still hold: one role (`owner`), synthetic data only, no connector, no customer login, duplicate guard is client-only (D5 (a)).

## 8. Sign-off

Owner name: ______________________

Date: ______________________

Decision (circle one): approve / approve with conditions / reject

Conditions or notes: ______________________
