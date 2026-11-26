# K-ID-1b owner lab runbook and evidence checklist

Status: **runbook, not yet run.** Nothing here is provisioned. The Kawalys Descope project does not exist until the owner approves gate B and creates it (see Gates).
Scope: one real Descope sign-in for the single owner, on the owner's own machine, against the loopback-only lab page of the Kawalys BFF (`server/`). Plan: `docs/superpowers/plans/2026-11-23-k-id-1b-hosted-sign-in.md`. Jira: BACK-56 (authentication), BACK-47 (gates).

Rules for this runbook:

- Never paste a token, cookie or email into chat, a file, a ticket or a log. Evidence records only the date, the result and the server's fixed log line.
- The project id (`P...`) and the owner user id (`U...`) are identifiers, not secrets. They may be written in the "Identifiers" table below once the project exists; the placeholders stay in every other part of this document.
- Never reuse or copy the Retail Tower Descope project. Retail Tower's `DESCOPE_*` variables are never read by Kawalys.

## 1. Gates

These are the K-ID-1b gates in BACK-14 section 7. Record each answer here before Task 5 (the CSP and issuer fixes the lab may reveal). Answers are the owner's; an empty cell means not decided.

| Gate | Decision needed | Recommendation | Owner answer |
| --- | --- | --- | --- |
| Entitlement | Descope plan, renewal and overage | Free tier is enough for one owner; confirm the current limits in the Descope console | |
| Region | Data region of the new project | The region closest to the owner that Descope offers; record it | |
| Sign-up | Who can create an account | Self sign-up **off**; the owner user is created in the console | |
| Methods / MFA | Login methods (decision pack section 14, item 4) | Email magic link first, passkey once the hosting domain is fixed (the pack's default; it needs no relying-party domain). No password | |
| Session lifetime | Descope session JWT TTL and refresh TTL | Keep Descope's session JWT short (10 min default); Kawalys session stays 8 h absolute / 1 h idle unless you change `KAWALYS_SESSION_*` | |
| Revocation | How access is pulled | Disable the user in Descope (blocks new sign-ins) plus `DELETE /auth/sessions` (kills existing Kawalys sessions) | |
| Secrets | Storage | None needed for this slice (no management key) | |
| Lab | Approval | Owner approves a loopback-only lab run on their machine | |
| Gate B | Authorization to provision | Creating the Kawalys Descope project is part of gate B (`docs/planning/BACK-47/PERSONAL-ALPHA-DECISION-PACK.md` section 12), not yet approved. Tasks 1-4 need no gate; Task 0 Step 1 and Task 5 wait for it | |

Owner steps once gate B is approved (plan Task 0):

1. Create a new Descope project named `Kawalys` (console, or Claude via the Descope MCP only after an explicit yes in chat).
2. In that project: disable self sign-up; configure the `sign-in` flow (the lab page runs the flow id `sign-in`) with the chosen methods; add `127.0.0.1` to Approved Domains (Descope's docs say to enter the domain only, without protocol or port, and give `127.0.0.1` as the local example; if the console refuses it or flow start fails with `E108202`, "Flow is running from a non-approved domain" (code and text from Descope's Common Errors docs, not seen in the console), try the `http://127.0.0.1:8787` form this runbook used before; which form the console accepts is NOT VERIFIED).
   In the `sign-in` flow's magic-link settings, set the redirect URL to `http://127.0.0.1:8787/auth/lab`.
3. Create the owner user and one test user named `lab-stranger` (used for the refusal check b).

### Identifiers

| Item | Value |
| --- | --- |
| Descope project id | `P...` (fill in) |
| Owner user id (the token `sub`) | `U...` (fill in) |
| Data region | (fill in) |

## 2. Start the lab

Prerequisites: Node 24, `npm ci` already run in `server/`, the Descope project from section 1 exists, and a browser. Use Chrome or Edge first, Firefox as the fallback, and avoid Safari. The session cookie is `__Host-kawalys_session; Secure`; Chromium browsers and Firefox are expected to accept it on `http://127.0.0.1` and Safari is not, but this is **expected, not yet verified in a lab**. If sign-in succeeds but `/auth/me` is 404, see the cookie row in section 4.

Run from `server/`, in PowerShell. Use no `KAWALYS_DATABASE_URL_*` variable for the first pass (in-memory sessions):

```powershell
Remove-Item Env:KAWALYS_DATABASE_URL_APP, Env:KAWALYS_DATABASE_URL_AUTH -ErrorAction SilentlyContinue
$env:KAWALYS_DESCOPE_PROJECT_ID='P...'
$env:KAWALYS_OWNER_SUBJECT='U...'
$env:KAWALYS_AUTH_LAB='1'
npm run build && npm start
```

Then open `http://127.0.0.1:8787/auth/lab`.

What the switches do:

- `KAWALYS_AUTH_LAB=1` turns the lab on. Any other non-empty value refuses to boot, and `1` together with `NODE_ENV=production` also refuses to boot. `GET /auth/lab` exists only when the lab is on **and** `KAWALYS_DESCOPE_PROJECT_ID` is set; otherwise it is a plain 404.
- The page (`server/src/auth/lab/`) hosts `@descope/web-component@4.6.3` (pinned, with SRI) running flow `sign-in`, posts only the resulting Descope session JWT to `POST /auth/session`, then, once that exchange settles (accepted, refused, rate limited or a network error), calls the component SDK `logout()` so Descope revokes its refresh token and clears its own browser storage. It shows "Descope session cleared", or "Could not clear the Descope session; clear site data now".
- In lab mode only, a refused token logs one line, `identity token refused: <code>`, plus ` claim=<name>` when known. It prints under Nest's `ERROR` label; that is how the line is made visible and is not a server fault. Outside the lab a refusal logs nothing. An identity-provider outage logs the fixed line `identity provider unavailable` in every mode.
- `KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE` (integer 1-100, default 10). Past the limit `POST /auth/session` answers 429 `rate_limited` **without looking at the token**. The window is 60 s from the first attempt. Behind loopback every caller shares one address, so the limit is effectively global.
- With `KAWALYS_DATABASE_URL_*` set (PR #77), sessions and the owner live in Postgres and the **first** owner sign-in (or `npm run local:up`, whose seed takes the same path, `server/src/ops/local-stack.ts:172-176`) writes the permanent `owner_binding` row. A wrong issuer or subject bound there fails closed until an operator moves the binding. So run every check below with no database variables, and add the database only after check (f) has confirmed the real issuer. The page shows the user id `kawalys-owner` in memory, a uuid with the database.

### Clean the browser after EVERY check

The page calls `logout()` once the `POST /auth/session` exchange has settled, whether it was accepted, refused (for example check b, `lab-stranger`), rate limited or failed on the network. It does not run if the Descope flow never completes, and a failed `logout()` leaves tokens behind (the page then says so). As a backstop, clear the browser after each check, not only at the end:

1. Clear site data for `http://127.0.0.1:8787`.
2. Open DevTools > Application and confirm Local Storage, Session Storage, IndexedDB and Cookies for that origin are empty.

The page itself says "After use, clear site data for this address."

## 3. Evidence checklist

Each row records only the date, the result and the server's fixed log line. Never write a token, cookie, email or full response body here.

| Check | What to do | Expected | Date | Result | Fixed log line |
| --- | --- | --- | --- | --- | --- |
| (a) Owner signs in | Open `/auth/lab`, sign in as the owner, then open `http://127.0.0.1:8787/auth/me` in the same browser | Page shows `Signed in as kawalys-owner` (a uuid with the database) and "Descope session cleared"; `/auth/me` returns 200 `{ user: { id, role } }` | | | |
| (b) Stranger refused | Clear site data, sign in as `lab-stranger` | `POST /auth/session` returns 404 `not_found` (DevTools > Network); the page shows "Sign-in did not complete". No refusal log line: the token is valid, the subject is just not the owner. Then clean the browser (the Descope tokens are still there) | | | |
| (c) Retail Tower token refused | The owner takes a session token from their own Retail Tower lab sign-in and sends it themself (commands below) | 404, and a log line `identity token refused: ...` (for example `ERR_JWT_CLAIM_VALIDATION_FAILED claim=iss` or `claim=aud`, or `ERR_JWKS_NO_MATCHING_KEY`) | | | |
| (d) Revocation | Sign in as the owner again first, in TWO separate cookie jars (a normal window and a private window, or Chrome and Edge), call them A and B. In A's DevTools console run `fetch('/auth/sessions',{method:'DELETE'}).then(r=>r.status)` (Chrome blocks pasting into the console until you type `allow pasting`). Then in B's console run `fetch('/auth/me').then(r=>r.status)` | A: 204 (`DELETE /auth/sessions` revokes every session of the owner and also clears A's own cookie). B: 404, which proves the server revoked B's session, since B's cookie was never cleared | | | |
| (e) Disable blocks sign-in | In the Descope console disable `lab-stranger` (and, as a separate pass, the owner), clear site data, try to sign in. Re-enable the owner afterwards | No new session: the Descope flow refuses, or `POST /auth/session` returns 404 | | | |
| (f) Issuer confirmed | Success of (a) is the evidence: the verifier pins `iss` to `https://api.descope.com/v1/apps/<project id>` and `aud` to the project id. If (a) fails with `claim=iss`, read the issuer only from the Descope console (project settings, custom domain). Never decode a token in an online tool. Record the full issuer URL here (it is an identifier, not a secret). `KAWALYS_DESCOPE_ISSUER` accepts https URLs only: if the observed issuer is not https, record it and stop for Task 5 | `iss` matches the default, or the override is recorded | | | |

### Check (c) commands

Never paste the token into chat or a file. Read it into a variable that is not echoed, send it, then remove it.

PowerShell 7 (uses `curl.exe`; plain `curl` is a PowerShell alias for `Invoke-WebRequest` and behaves differently):

```powershell
$t = Read-Host 'Retail Tower session token' -MaskInput
curl.exe -i -X POST -H "Authorization: Bearer $t" http://127.0.0.1:8787/auth/session
Remove-Variable t
```

Git Bash:

```bash
read -rs T
curl -i -X POST -H "Authorization: Bearer $T" http://127.0.0.1:8787/auth/session
unset T
```

Paste only the status line and the server's log line into the table above. The attempt counts toward the sign-in limit.

## 4. Troubleshooting

Look at the server console for the `identity token refused:` line first; the browser only ever sees a 404 (or 429).

| What you see | Meaning | What to do |
| --- | --- | --- |
| `ERR_JWT_CLAIM_VALIDATION_FAILED claim=aud` | The token was issued for another project (or the wrong project id is set) | Check `KAWALYS_DESCOPE_PROJECT_ID` is the Kawalys project id, not Retail Tower's |
| `ERR_JWT_CLAIM_VALIDATION_FAILED claim=iss` | The issuer differs from the pinned one | Compare with the project's real issuer; set `KAWALYS_DESCOPE_ISSUER` (https only) if it is a custom domain or differs. Recheck (f) |
| `claim=nbf`, `ERR_JWT_CLAIM_VALIDATION_FAILED claim=iat`, or `ERR_JWT_EXPIRED claim=iat` / `claim=exp` | Clock skew (tolerance is 5 s), or the token is older than `KAWALYS_DESCOPE_MAX_TOKEN_AGE_SECONDS` (default 900 s). A laptop clock running **behind** Descope makes `iat` lie in the future and gives `ERR_JWT_CLAIM_VALIDATION_FAILED claim=iat` (like `claim=nbf`). jose reports a token older than the age cap as `ERR_JWT_EXPIRED claim=iat` | Sync the system clock; sign in again without delay |
| `KAWALYS_TOKEN_KIND` | Not a Descope session token (`drn` is not `DS`) or it is a refresh token | The page sends the session JWT; if you called the route by hand, send the session token, not the refresh token |
| `KAWALYS_IMPERSONATION` | The token has an `act` or `dact` claim | Sign in normally, not through an impersonation |
| `KAWALYS_BAD_SUBJECT`, `KAWALYS_INPUT` | Malformed `sub`, or an empty or oversized token | Should not happen with the real flow; report it |
| `ERR_JWKS_NO_MATCHING_KEY` | The signing key is not in this project's JWKS | The token is from another project (as expected for check c); otherwise recheck the project id |
| `identity provider unavailable` (or a JWKS timeout or network error, which is classified the same way) | Network failure or timeout reaching `api.descope.com` for the JWKS | Check connectivity and any proxy or firewall, then retry |
| 429 `rate_limited` | More than `KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE` attempts in 60 s (shared by all callers) | Wait 60 s from the first attempt; the token is not examined while limited |
| `identity provider not configured` in the server log, every sign-in is 404 | `KAWALYS_OWNER_SUBJECT` is unset (for example a new terminal). The page still serves, because it needs only the project id, but the verifier is unconfigured, so every sign-in is refused | Set `KAWALYS_OWNER_SUBJECT` to the owner's Descope user id `U...` in the same shell and restart |
| 404, the page says "Sign-in did not complete", and no log line at all (same as check b) | `KAWALYS_OWNER_SUBJECT` is set to the wrong value: the token verifies, but its subject is not the configured owner. A value with characters outside letters, digits, `_` and `-` (an email, for instance) refuses to boot instead, naming `KAWALYS_OWNER_SUBJECT` | Use the Descope **user id** (`U...`), not a login id or an email. Fix it and restart |
| `POST /auth/session` returns 200 but `/auth/me` is 404 | The browser may have rejected the `Secure` `__Host-` cookie on plain http (expected to work in Chromium and Firefox, not yet verified in a lab) | In DevTools > Network, open the `POST /auth/session` response and its Cookies tab: Chromium shows a blocked Set-Cookie there with the reason. Use `http://127.0.0.1:8787` exactly (not `localhost`). Check the cookie name only; never copy its value, because the session cookie is a credential |
| Blank page or no sign-in form; console shows `Refused to load ... Content Security Policy` | The page's strict CSP (`default-src 'none'`, scripts from `https://unpkg.com`, connections to `self` and `https://api.descope.com`) blocks something the real flow needs: likely `https://static.descope.com` and style, image or font sources. A regional project may also use a host other than `api.descope.com` | Record the **exact blocked host and directive** from the browser console (hostname only). It is added in Task 5 with a test. Do not loosen the CSP by hand |
| "Could not clear the Descope session; clear site data now" | `logout()` failed; Descope tokens may remain in the browser | Clear site data for `http://127.0.0.1:8787` now and confirm storage is empty |
| Server refuses to boot naming `KAWALYS_AUTH_LAB` | The value is not `1`, or `NODE_ENV=production` is set | Set `1` (or unset it) and remove `NODE_ENV=production` |
| `GET /auth/lab` is 404 | The lab flag or `KAWALYS_DESCOPE_PROJECT_ID` is missing | Set both and restart |

## 5. Stop and clean up

1. Stop the server (Ctrl+C in its terminal).
2. Clear site data for `http://127.0.0.1:8787` and confirm DevTools > Application is empty.
3. Unset the variables in that PowerShell session (or close it):

   ```powershell
   Remove-Item Env:KAWALYS_DESCOPE_PROJECT_ID, Env:KAWALYS_OWNER_SUBJECT, Env:KAWALYS_AUTH_LAB -ErrorAction SilentlyContinue
   Remove-Item Env:KAWALYS_DESCOPE_ISSUER, Env:KAWALYS_DATABASE_URL_APP, Env:KAWALYS_DATABASE_URL_AUTH -ErrorAction SilentlyContinue
   ```

4. Re-enable any Descope user disabled for check (e).
5. Keep the Descope project and the owner user; K-ID-2 needs them.
6. Do not commit this file with filled-in tokens, emails or cookies. Only dates, results, fixed log lines and the two identifiers belong here.

## 6. Deny-all baseline (before any configuration)

Run this before section 2, with no `KAWALYS_*` variable set (start the server from `server/` with `npm run build && npm start`), so you can tell later that the variables are what changed the answers. **VERIFIED 2026-11-26** against `main` at f748762: `server/` was built and `node dist/main.js` run with neither variable set (no Descope project, no network call).

```powershell
curl.exe -i http://127.0.0.1:8787/process
curl.exe -i http://127.0.0.1:8787/auth/me
curl.exe -i -H "x-kawalys-demo-persona: owner" http://127.0.0.1:8787/demo/evidence/E-1
curl.exe -i http://127.0.0.1:8787/evidence
curl.exe -i http://127.0.0.1:8787/auth/lab
curl.exe -i -X POST -H "Authorization: Bearer abc.def.ghi" http://127.0.0.1:8787/auth/session
```

(`abc.def.ghi` is a dummy string, not a token.)

| Request | Result | Why |
| --- | --- | --- |
| `GET /process` | 200 `{"service":"kawalys-bff","process":"up","synthetic":true}` | Public (`server/README.md:65`) |
| `GET /auth/me` | 404 `not_found`, `cache-control: no-store` | No session cookie (`server/src/auth/auth.guard.ts:47-48`) |
| `GET /demo/evidence/E-1` with the persona header `owner` | 404 `not_found` | The persona header is never authentication (`auth.guard.ts:25-27`) |
| `GET /evidence` | 404 `not_found` | Route exists only with both database URLs (`server/README.md:72`) |
| `GET /auth/lab` | 404 `not_found` | Lab off, so the route is not registered (`server/src/auth/auth.config.ts:75-77`, `server/src/auth/lab/lab.controller.ts:11-16`) |
| `POST /auth/session` with the dummy bearer | 404 `not_found`; the server logs one line `identity provider not configured` | `UnconfiguredVerifier` (`server/src/auth/build-auth.ts:46-50`, `server/src/auth/identity/identity-verification.port.ts:37-40`, `server/src/auth/auth.controller.ts:68`) |

Every denial is the same body, `{"error":{"code":"not_found","message":"Not found.","request_id":"..."}}`, so a caller cannot tell "no session" from "wrong owner" (`server/README.md:79-91`, `:132`).

**VERIFIED 2026-11-26 with placeholder ids** (`PplaceholderPROJECT`, `UplaceholderOWNER`, `KAWALYS_AUTH_LAB=1`, no Descope project): `GET /auth/lab` answers 200 with `<descope-wc ... flow-id="sign-in">` and the CSP from section 4 (`server/src/auth/lab/sign-in-page.ts:20-30`, `:87`); `GET /auth/me` without a cookie is still 404; the dummy bearer is 404 with the log line `identity token refused: ERR_JWS_INVALID` (`auth.controller.ts:72`).

## 7. Owner path and other-subject path, with `npm run local:up` (BACK-61)

**NOT VERIFIED**: this part needs Docker, a real Descope project and a real sign-in, none of which were available when this section was written. It follows `server/README.md:27-59`.

**Order matters.** `local:up` seeds for the owner in the environment when both Descope variables are set, otherwise for a synthetic owner that no real token can match (`server/src/ops/local-up.ts:52-57`, `server/src/ops/local-stack.ts:32-40`). Only one owner can be bound (`server/src/auth/identity/database-owner-directory.ts:5-6`, `server/README.md:40`). So set `KAWALYS_DESCOPE_PROJECT_ID`, `KAWALYS_OWNER_SUBJECT` and `KAWALYS_AUTH_LAB` (section 2) **before** `local:up`. If you ran it first, the real owner is refused (fail closed) until `npm run local:down` and a fresh `local:up` (`server/README.md:185`, `:211`).

**`local:up` itself writes the permanent `owner_binding` row**, using the issuer in effect at that moment: the seed calls the same `DatabaseOwnerDirectory.resolve` path as a first sign-in (`server/src/ops/local-stack.ts:172-176`, `database-owner-directory.ts:48-59`). So run it only after check (f) of section 3 has passed with the final `KAWALYS_DESCOPE_ISSUER` (if you needed one). If the issuer or subject changes afterwards, the bound triple no longer matches and sign-in fails closed with no log line: `npm run local:down`, then `local:up` again (`server/README.md:40`, `:211`).

From `server/`, with the variables set:

```powershell
npm run local:up
```

It prints two `export KAWALYS_DATABASE_URL_APP=...` and `export KAWALYS_DATABASE_URL_AUTH=...` lines (`local-up.ts:63-65`). Those lines are bash. In PowerShell translate them (the passwords live in `server/.local-stack/credentials.json`, gitignored, `server/.gitignore:8`; paste them nowhere else):

```powershell
$env:KAWALYS_DATABASE_URL_APP  = '<value printed by local:up>'
$env:KAWALYS_DATABASE_URL_AUTH = '<value printed by local:up>'
```

In Git Bash use the `export` lines as printed. Without both, `npm start` runs in in-memory mode and `/evidence` stays 404.

**Check the seed line.** `local:up` must print `seeded for the configured Descope owner:` (`local-up.ts:58`). If it prints `seeded for the synthetic local owner (no Descope configured)`, one of the two Descope variables was not set (`server/src/auth/auth.config.ts:108-109`): stop, run `npm run local:down`, set both (plus `KAWALYS_DESCOPE_ISSUER` if check (f) needed it) and start again.

Then `npm start`.

| Step | Expected | Cite |
| --- | --- | --- |
| `GET /evidence` before signing in | 404 | `server/README.md:59`, `auth.guard.ts:47-48` |
| **Owner:** sign in at `http://127.0.0.1:8787/auth/lab`, then in DevTools `fetch('/evidence').then(r => r.status)` | 200 and `{ items }` (6 seeded rows, newest first); `/auth/me` returns `{ user: { id: <uuid>, role: "owner" } }` | `server/README.md:49`, `:235`, `auth.controller.ts:80`, `:83-88` |
| **Other subject:** clear site data, sign in as `lab-stranger`, then `fetch('/evidence')` | `POST /auth/session` is 404 (no cookie issued), so `/evidence` is 404; no server log line, because the token is valid and only the subject differs | `auth.controller.ts:75-76`, check (b) |
| Any other holder of a different project's token | 404 plus `identity token refused: ...` | check (c) |

Use the browser for these. Whether `curl` keeps the `Secure` `__Host-` cookie over plain `http://127.0.0.1` is not verified (`server/src/auth/session/session-cookie.ts:6-8`, `server/README.md:176-177`).

## 8. Rollback

Smallest step first. Section 5 already covers stopping the server, clearing the browser and unsetting the variables.

| Goal | Do this | Cite |
| --- | --- | --- |
| Kill live sessions now | While signed in: `fetch('/auth/sessions',{method:'DELETE'}).then(r=>r.status)` gives 204 and revokes every session of the owner. The in-memory store also loses every session on restart. | `auth.controller.ts:99-106`, `server/README.md:135-136` |
| Pull one person's access | Disable the user in Descope (blocks new sign-ins only; it does not end an existing Kawalys session, and Descope's Force logout ends Descope sessions, not Kawalys ones). The owner is the only user, so for a live Kawalys session use the rows above and below. | check (e), Descope docs (User Management; NOT VERIFIED in the console) |
| Cookie unavailable (lost device) | In-memory mode: restart the server. Database mode: sessions survive a restart, so change `KAWALYS_OWNER_SUBJECT` (next row; the old session dies on its next request) or `npm run local:down`. | `server/README.md:135-136`, `auth.guard.ts:52-58` |
| Change the owner | Edit `KAWALYS_OWNER_SUBJECT` and restart: old sessions die on their next request because the triple is rechecked every time. With the database on, the new identity cannot bind until `owner_binding` is moved, so for the local stack run `npm run local:down` (deletes the volume and all local data) and `local:up` again. | `auth.guard.ts:52-58`, `database-owner-directory.ts:5-7`, `server/README.md:40`, `:211` |
| Drop the durable layer | Unset both `KAWALYS_DATABASE_URL_*` variables (sessions return to memory; evidence routes vanish), or `npm run local:down` | `server/README.md:181` |
| Remove the Descope project | Console: Project Settings > General > **Delete Project**, confirm by typing the project name (Descope docs, Project Settings; NOT VERIFIED in the console). Irreversible; keep the project if K-ID-2 needs it (section 5 item 5). | docs.descope.com/management/project-settings |

## 9. What this does not do

- No customer sign-in: one owner, no sign-up, no team management, no second role (`server/README.md:152`, `:191`). Customers never sign in to Mission Control (`CLAUDE.md`).
- The app and the prototype still never call the server (`server/README.md:7`, `:386`).
- Nothing is deployed: the server binds `127.0.0.1` only (`server/src/main.ts:11-12`); hosting is BACK-64, not run (`docs/planning/BACK-51/demo-script-and-limits.md:42`). TLS for the `Secure` cookie and database TLS are still open (`server/README.md:176-177`, `:209`).
- MFA and session lifetimes remain owner decisions (see `server/README.md:173-175`).
