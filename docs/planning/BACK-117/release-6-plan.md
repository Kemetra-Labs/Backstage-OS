# Release 6 deploy plan (BACK-117)

**Status: DONE. Published and deployed 28 Nov 2026 (owner approved the plan, U/V/W, publish and deploy). Record: execution-plan.md section 12.** Prepared 28 Nov 2026 against `origin/main` `8818b12`.
Live today: release 5 (checkout `92989d1`; bff `sha256:5dd01e77…`, web `sha256:d6876cad…`; CSP enforcing).

## 1. What release 6 contains

| PR | What | Runtime effect on the pilot |
| --- | --- | --- |
| #173 BACK-131 | Approved source identity, first-connect only, reauthorized reconnect | None until `KAWALYS_APPROVED_SOURCES` is set (unset: every connect refused) |
| #174 BACK-127 | Locked screens and drafts on expiry / unverifiable session / failed sign-out; read-only `GET /api/auth/session-state` | Visible in the app after sign-in |
| #175, #180 COG-05, #179 BACK-105/110 | Cognitive core and memory read budget (K.Brain) | Server-side reads only |
| #178 BACK-172 | Server request id, write limits, idempotency, **Host allowlist required in production** | **Needs a new env setting (below), or the BFF will not start** |
| #181 BACK-148 L/L2 | Project observations in the investigation room (type filter, citations) | Visible in the room; the database holds no cases yet (O1) |
| #182 BACK-52 slice A | Read-only GitHub transport, inactive | None: no App settings, scheduler off |

No database migration since release 5 (`server/migrations` unchanged). The only new **required** setting is
`KAWALYS_ALLOWED_HOSTS`. Optional settings stay unset: `KAWALYS_APPROVED_SOURCES`, `KAWALYS_GITHUB_APP_*`,
`KAWALYS_GITHUB_REFRESH_MINUTES`.

## 2. Preconditions

1. CI on `main` green at the release commit (the push run for `8818b12` was in progress at writing; the three before it are green, so the Depot runners are back).
2. **The AWS connector must be re-authorized** in this session's connector settings (a read-only Lightsail call returned "requires authentication"). Deploys use temporary SSH: port 22 opened to one /32, a short-lived Lightsail key, then the original firewall restored and the key deleted.
3. Your explicit go-ahead for **publish** (Images workflow, public GHCR images) and, separately, for **deploy**.

## 3. Steps

1. **Publish:** run the Images workflow on `main` at the release commit; record both digests; confirm anonymous pull works.
2. **Deploy over temporary SSH, one script with automatic rollback** (same pattern as releases 3-5):
   - Back up `.env.pilot` (timestamped copy, mode 0600).
   - Add `KAWALYS_ALLOWED_HOSTS=kawalys.kemetralabs.com,localhost,127.0.0.1` if absent. This is a public host list, not a secret.
   - Check out the release commit and set the two image digests.
   - Run `preflight-deploy.sh` (it now also requires the host list with `127.0.0.1`), then `config -q`, `pull`, and `up -d bff web` with the three `-f` files.
   - Wait for readiness: `/api/health` must report `ready:true` within 90 s, or the script restores the env backup, the previous checkout and the previous images automatically.
3. **Restore the firewall** to its saved rules (80/443 Cloudflare ranges only, 22 `lightsail-connect` only) and delete the temporary key.

## 4. Verification after deploy (agent)

- `/api/health` ready; `/` and `/sign-in` keep the enforcing CSP and security headers; protected routes 404 signed out; `GET /api/auth/session-state` 404 signed out; Origin CA certificate still served.
- Both containers healthy with the allowlist on; inside the host, the BFF answers 404 to an unknown `Host` and 200 to `127.0.0.1`.
- **Gate B checklist** (runbook, BACK-172): forged `X-Forwarded-For` / `CF-Connecting-IP` ignored; sign-in limit per real client; unknown `Host` through Cloudflare refused on a completed exchange; Origin guard holds; a client `x-request-id` is not echoed. Results recorded without secrets.

## 5. Owner check after deploy

Sign in once (your current session cookie may still be valid; sessions are unchanged). Optional: leave the tab, come back, and see
that the app re-checks quietly; sign out and see the screen clear. Nothing else is needed: the database has no cases yet (O1).

## 6. Rollback

Restore the env backup (the extra `KAWALYS_ALLOWED_HOSTS` line is harmless for release 5 anyway), check out `92989d1`, set
release 5 digests (bff `sha256:5dd01e775932c1a112fba4dd71eb921c33016ab54a3eb3a375db5ab748404568`, web
`sha256:d6876cadef8a45ab0f64a3c50fd543c9ee73e5cea90171151d9edee68645fb55`), `preflight-deploy.sh`, `up -d bff web`.

## 7. Decisions for the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| U | Include the `/sign-in` font fix (O2: add `descopecdn.com` to `font-src` on the sign-in matcher) | **Yes**, as one tiny PR merged before publishing; it is cosmetic and isolated, and a release is happening anyway |
| V | Run Gate B during this deploy | **Yes**, right after the readiness check |
| W | Release commit | **Latest green `main` at publish time** (currently `8818b12` plus the font fix if U) |
