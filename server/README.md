# Synthetic Kawalys BFF (BACK-69, T0)

A minimal NestJS service that returns **synthetic** data only. It exists to prove the error and
request-id conventions before any real backend work. It has no database, no connectors and no secrets. It carries the owner-only authentication foundation described
below (BACK-47, BACK-56), which is inert until Kawalys Descope configuration is set. Nothing in the prototype
(`index.html`, `js/`, `css/`) or `app/` calls it yet.

The `x-kawalys-demo-persona` header is a **display switch, not authorization**: any caller can set it. The auth
guard never reads it.

## Commands

Node 24 is required (`.nvmrc`, `engines`). Run from `server/`. CI runs `npm run check` here on Node 24, in the required job (BACK-74). The suite also passes on Node 22 locally (npm prints an EBADENGINE warning).

```bash
npm ci
npm run check    # typecheck + Jest (NestJS 12, TypeScript 6.0.3, Jest 30)
npm run build    # emits dist/
npm start        # node dist/main.js
```

NestJS 12 is ESM-only, so `npm test` runs Jest in ESM mode (`node --experimental-vm-modules`, `useESM` in `jest.config.js`). The build still emits CommonJS, which loads NestJS through Node's `require(esm)`.

`KAWALYS_BFF_PORT` sets the port (default `8787`). The server binds `127.0.0.1` only.

## Routes

| Route | Behaviour |
| --- | --- |
| `GET /process` | Public. Process liveness only: `{ service, process: "up", synthetic: true }`. Never says "healthy". |
| `POST /auth/session` | Public. The only route that accepts a Descope session JWT (`Authorization: Bearer <jwt>`). On success: 200, `{ user: { id, role }, expires_at }` and the session cookie. |
| `GET /auth/me` | Session required. The signed-in user. |
| `DELETE /auth/session` | Session required. Revokes the current session and clears the cookie (204). |
| `DELETE /auth/sessions` | Session required. Revokes every session of the signed-in user (204). |
| `GET /demo/evidence/:id` | Session required. Synthetic evidence. Fixture ids `E-1` (visible to all) and `E-5` (technical persona only). Persona comes from `x-kawalys-demo-persona`: `technical`, `owner` or `nontechnical` (default). |

Every route is protected unless it is marked `@Public()` (the guard is global), so a new controller is denied by default.

## Error behaviour

Every error body is the envelope built in `src/errors/safe-error.ts`; `details` is never set and
messages are fixed:

| Code | Status | Message |
| --- | --- | --- |
| `not_found` | 404 | Not found. |
| `validation_error` | 400 | The request is not valid. |
| `rate_limited` | 429 | Too many requests. |
| `internal_error` | 500 | Something went wrong. |

- 401 and 403 are reported as 404 `not_found` (policy M05-D05-B), so there is no `forbidden` code.
- A record the persona may not see is indistinguishable from an absent one (`E-5` for a non-technical
  persona looks the same as an unknown id).
- An inbound `x-request-id` is echoed only if it is a single value of 8-64 characters from
  `[A-Za-z0-9-]`. Otherwise (CR/LF, too short, too long, other characters, repeated header, missing)
  a fresh UUID is used. The id is echoed in the `x-request-id` response header and in the envelope,
  and is only ever returned to the caller who sent it.

## Authentication (BACK-47, BACK-56)

**Does nothing live until Kawalys Descope configuration is set.** Unconfigured, every protected route is denied and no
network call is made.

Chain: provider JWT, verified once at `POST /auth/session` -> the full `(providerKey, issuer, subject)` triple ->
exactly one configured owner identity (the issuer is part of the match) -> an opaque Kawalys session. Provider claims
(admin, email, groups) grant nothing, and a provider JWT is never accepted on any other route.

- **Verifier**: `src/auth/identity/descope-verifier.ts`, behind `IdentityVerificationPort` (jose, RS256 only, `exp` / `sub` / `iat`
  required, audience = project id and required, one pinned issuer, token-age cap, refresh tokens refused). Results are
  `verified`, `refused`, `unavailable` or `unconfigured`; all but the first deny, and clients cannot tell them apart.
- **Sessions**: 32 random bytes, base64url; only the SHA-256 is stored (`SessionStore`, in-memory today). Absolute expiry
  (default 8 h) and idle expiry (default 1 h). Revocation removes the session. On every request the session's triple is
  rechecked against the current owner configuration, so changing the owner kills old sessions. A restart drops all
  sessions (fail closed). A durable store waits for the database decision (BACK-55).
- **Transport**: one cookie, `__Host-kawalys_session`, `Secure; HttpOnly; SameSite=Strict; Path=/`, with `Cache-Control: no-store`
  on auth responses. A repeated session cookie is refused. No CORS is enabled and the session is never read from a header
  or query string.
- **Errors**: every denial is the standard `not_found` envelope (policy M05-D05-B). The only log lines are fixed
  operator messages for an outage or a missing configuration; never a token, claim or subject.
- **No passwords** are stored or handled. There is no sign-up and no team management.

Configuration (names only; none is a secret):

| Variable | Meaning |
| --- | --- |
| `KAWALYS_DESCOPE_PROJECT_ID` | The Kawalys Descope project id. Must be a separate project from Retail Tower's. |
| `KAWALYS_OWNER_SUBJECT` | The owner's Descope user id (`sub`). Exactly one owner. |
| `KAWALYS_DESCOPE_ISSUER` | Optional https issuer override (for example a custom domain). Default `https://api.descope.com/v1/apps/<project id>`. |
| `KAWALYS_DESCOPE_MAX_TOKEN_AGE_SECONDS` | Optional, 60-3600, default 900. |
| `KAWALYS_SESSION_ABSOLUTE_TTL_SECONDS` | Optional, 300-86400, default 28800. |
| `KAWALYS_SESSION_IDLE_TTL_SECONDS` | Optional, 60 up to the absolute TTL, default 3600. |

In production (`NODE_ENV=production`) the project id and owner subject are required, or the server refuses to boot. A
set but malformed value always refuses to boot. Retail Tower's `DESCOPE_*` variables are never read.

Test doubles (a fake verifier, clock, store, directory) exist only under `test/` and are injected through `createApp`;
`createApp` refuses any override in production, and `main.ts` passes none.

Still needed before a real sign-in (K-ID-1b): a separate Kawalys Descope project and a sign-in flow, the owner's user
id, confirmation of the real token's `iss` and `aud` against this verifier, the TLS front for the `Secure` cookie, and
an owner decision on session lifetimes and MFA. Not done here: rate limiting on `POST /auth/session` (the service is
loopback-only today), a durable session store, and any UI.

## Provenance

`src/errors/envelope.ts` and `src/auth/tokens.ts` are copied from Retail Tower, and the Descope verifier is adapted from it. See
[THIRD_PARTY.md](THIRD_PARTY.md) for paths, pinned SHAs, strategy and licence.

## Rollback

To remove only the authentication foundation: delete `server/src/auth/` and `server/test/auth/`, restore `create-app.ts`,
`health/process.controller.ts` and `test/http/app.spec.ts` from `main`, and remove `jose` from `server/package.json` and
the lockfile. To remove the whole BFF: delete `server/`, then revert the `CLAUDE.md` bullet, the root `NOTICE`, the root `LICENSE`, the
`license` field in the root `package.json`, and the "Synthetic BFF" section of the root `README.md`.

## Out of scope / still gated

- BACK-47 exit criteria for anything beyond this T0.
- BACK-55 (database), BACK-58 (secrets). BACK-56 (authentication) is only the foundation above; real sign-in is K-ID-1b.
- Correlation helper: deferred because it needs `@opentelemetry/api`.
- TypeScript 7 (native compiler): `ts-jest` 29 needs the JavaScript compiler API, so the toolchain stays on TypeScript 6.0.3 (BACK-75).
