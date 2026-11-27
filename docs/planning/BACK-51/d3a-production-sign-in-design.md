# D3 (a): production sign-in for the owner. Design card for the owner's decision, 27 Nov 2026

Status: **proposal. Nothing is built.** It adds a dependency and changes authentication, so it needs the owner's approval of the approach and of the Descope project changes before any code.

## 1. What exists and what is missing

| Part | State |
| --- | --- |
| Server exchange | **Done and tested.** `POST /auth/session` takes a Descope JWT in `Authorization: Bearer`, verifies it (`jose`), resolves the subject to the one owner (`KAWALYS_OWNER_SUBJECT`), issues a Kawalys session cookie. Per-client rate limit. Every refusal is the same 401. `GET /auth/me` and `DELETE /auth/session(s)` exist. |
| App session | **Done.** `app/src/live/session.ts` treats only a 200 from `/api/auth/me` naming the owner as signed in. It never keeps the subject id. |
| Browser sign-in | **Lab only.** `server/src/auth/lab/sign-in-page.ts` runs the Descope flow on the owner's own machine (`KAWALYS_AUTH_LAB=1`, loopback, refuses production). It loads `@descope/web-component@4.6.3` from unpkg with an SRI hash and a nonce CSP, posts the session JWT once, then calls the SDK `logout()` so no Descope refresh token stays in browser storage. |
| Production | The deployed pilot has `NODE_ENV=production`, the project id and owner subject set, and **no way to get a JWT into the exchange**. Every protected route is deny-all, as intended until this is built. |
| Descope project "Kawalyse" | Exists, **unconfigured**: no sign-in flow set up, no approved domain, magic link and passkeys off. The owner's user exists (self sign-up must stay off). |

## 2. Options

| | A. Production copy of the lab page | B. Sign-in route inside the React app (recommended) | C. Descope hosted page with redirect |
| --- | --- | --- | --- |
| How | The BFF serves the strict-CSP page in production (`/api/auth/sign-in`). | A `/sign-in` route in `app/` mounts `@descope/web-component` (bundled from npm, version pinned in `package-lock.json`), posts the JWT to the existing exchange, calls `logout()`, then `/auth/me` decides. | Redirect to a Descope-hosted login; Descope redirects back with a token or code. |
| New dependency | None new, but the **runtime script from unpkg** stays (SRI-pinned; availability and supply chain at runtime). | `@descope/web-component` (build time, lockfile integrity). No third-party script at runtime. | None in the app, but a callback route and token or code handling are needed. |
| Server change | Un-gates a page that is deliberately lab-only; the "never in production" invariant weakens. | **None.** | New callback endpoint on the BFF. |
| Caddy change | The page needs its own CSP; `/api/*` is already proxied. | Add a CSP for the SPA (`connect-src 'self' https://api.descope.com`, no inline script). | Needs the redirect allow-list. |
| Cost | Smallest. | Medium: one route, one dependency, a CSP rollout, tests. | Largest and most new surface. |

**Recommendation: B.** The lab code stays lab-only; production gets a normal app route behind the same exchange and cookie; the third-party code is pinned by the lockfile and served from our origin; the one new runtime hole in the CSP is `https://api.descope.com`. The fixture build (no `VITE_KAWALYS_LIVE`) must not include the route or the dependency's runtime, and must still make no request.

## 3. Properties the build must keep (each gets a test, including negative ones)

- The Descope session JWT is sent **once** to `POST /api/auth/session` and never stored by our code. After the exchange settles (success, refusal, rate limit or network error) the SDK `logout()` runs, as the lab does. A test asserts nothing Descope-related remains in `localStorage` and `sessionStorage`.
- Signed in means a 200 from `/api/auth/me` with role owner, nothing else. A user who authenticates at Descope but is not the owner subject gets the same signed-out state as no session.
- No route, script or request for sign-in exists in the default (fixture) build.
- 401 and 404 stay indistinguishable; a failed or refused sign-in shows one neutral message.
- Self sign-up stays off in Descope. The Kawalys cookie flags, rate limit and session revoke endpoints are unchanged.
- The CSP for the SPA is tested by running it (no inline script, `connect-src 'self' https://api.descope.com`).

## 4. Rollout (each step gated)

| # | Step | Gate |
| --- | --- | --- |
| 1 | Owner picks the option (this card) and the sign-in methods | Owner |
| 2 | Descope "Kawalyse": the flow, the methods, approved domain `kawalys.kemetralabs.com`, self sign-up off, redirect URL | **Owner approves the Descope change** |
| 3 | Build B with tests, review, merge (subagent-driven: task reviews plus a final review) | merge on green |
| 4 | Build and publish release 3 images (digest-pinned) | **Owner approves publishing** |
| 5 | Deploy `web` (three compose files; floor release 2) and the BFF if changed; readiness gate | **Owner approves deploy** |
| 6 | P5: the owner signs in on the live site; evidence recorded | Owner |

## 5. Questions for the owner

1. **Option** A, B or C (recommendation B).
2. **Sign-in methods** for the one owner account (for example email magic link, passkey, or both). Passkeys need the approved domain to be final.
3. **Approval to configure Descope "Kawalyse"** as in step 2 (the agent can do it through the Descope connector, or the owner does it in the console).

## 6. Risks

- The component version (4.6.3 in the lab) has to be re-checked at build time. A Descope upgrade can change the stored-token behaviour that the `logout()` call depends on, so a test pins it.
- A CSP on the SPA can break the page if a font or asset is blocked; roll it out report-only first on the pilot.
- If Descope is down, the owner cannot sign in; an existing session cookie keeps working until it expires. There is no fallback sign-in, by design.
