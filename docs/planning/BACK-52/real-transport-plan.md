# BACK-52: real read-only GitHub App transport for one approved repository

**Status: SLICE A IMPLEMENTED on branch `claude/back52-slice-a-transport` (owner approved slice A and P, Q, S, T on 28 Nov 2026), proven with fakes only. Activation (section 5) is NOT done: no App, no installation, no credentials, no GitHub access.** Read-only preflight on `origin/main`
`3e2b135` (28 Nov 2026). This plan splits BACK-52 into **slice A** (buildable now: real transport, token minting, guarded runner,
all proven with fakes and disposable Postgres) and **activation** (owner-performed and owner-approved: create the App, install it on
one repository, hand over credentials under BACK-128, first real read). Slice A never contacts GitHub.

## 1. Preflight

| Check | Result |
| --- | --- |
| Gates from the Blueprint | BACK-131 R1 policy: **merged** (#173). BACK-172 shared controls: **merged** (#178). BACK-128 credential custody: **open** (blocks activation, not slice A). BACK-116 least-privilege AWS: **open** (blocks activation if the key goes on the host by the operator path). |
| Delivered baseline | Read-only mapper `server/src/connectors/github/github.observer.ts` (repository, PRs, issues as typed Observations; every failure is denied/unknown/error, never ok; allow-listed fields only; renamed repo refused by `full_name`) and a transport **port** with `get` only (`github.transport.ts`); canned-ingest DB tests. No transport implementation, no token, no runner, no caller in production (BACK-131 caller guard). |
| Overlap | BACK-148 L/L2 session works on Portfolio/Investigation projection (`GET /evidence` type filter); no overlap with the transport. BACK-49/148/50 consume what this produces. |
| Dependencies | `jose` 5.10.0 is already a server dependency (RS256 signing). Node 24 `fetch`. **No new dependency.** |

## 2. Gaps (slice A)

| # | Requirement (BACK-52 + Blueprint) | Today | Gap |
| --- | --- | --- | --- |
| A1 | Real read-only transport, no writes | Port only | `fetch` implementation: GET only, fixed base `https://api.github.com`, no redirects followed, timeout, pinned API version |
| A2 | Token custody, never in client/logs | None | GitHub App JWT (RS256, short expiry) -> installation token **down-scoped** to the one repository id and `metadata`, `pull_requests`, `issues` read; in memory only, refreshed before expiry |
| A3 | Immutable repository id (owner/repo alone is not proof) | Identity is `owner/repo` | Pin the numeric id in the approved identity; the mapper refuses a body whose `id` differs (`id_mismatch`) |
| A4 | Grant enforced **before every network request**; **no provider call after a committed revoke** | `ingest` refuses without a grant; nothing checks before a call | A runner that checks approval + active grant before each request and stops on the first refusal |
| A5 | Truthful errors | Mapper classifies 401/403/404/429/5xx/network/timeout; never ok | Keep; add token-mint failures (`denied`/`unavailable`), redirect (`unexpected_status`) |
| A6 | One way to run it, no new HTTP surface by default | No caller | Decision S below |

## 3. Design (slice A)

1. **`server/src/connectors/github/github.fetch-transport.ts`** implements `GitHubReadTransport.get(path)`: only relative `/repos/<approved owner/repo>/...` paths (anything else throws before a request), `redirect: 'manual'` (a 3xx is `unexpected_status`), 10 s timeout (`AbortSignal.timeout`), headers `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, a generic `User-Agent: kawalys-pilot`, `Authorization: Bearer <installation token>`. Network/timeout map to `GitHubTransportFailure`. The fetch function is injected (tests use a fake; nothing in tests reaches the network).
2. **`github.app-token.ts`** (token provider, separate from the read port): signs an App JWT with `jose` (RS256, `iat` -60 s, `exp` +9 min, `iss` = App id) and mints an installation token with `POST /app/installations/<id>/access_tokens` and body `{ repository_ids: [<pinned id>], permissions: { metadata: 'read', pull_requests: 'read', issues: 'read' } }`. This POST is the **only** non-GET call; it goes to GitHub's token endpoint and cannot change a repository. Token held in memory, renewed 5 min before `expires_at`, never logged, never stored, never returned by any route. Private key read from server config (custody per BACK-128), never echoed in errors.
3. **Pinned id (A3).** Approved identity for GitHub becomes `github:<owner>/<repo>#<repository id>` in `KAWALYS_APPROVED_SOURCES`; the id is required for the runner to start (connect/ingest keep working on the name for existing tests). `repositoryPayload` checks `body.id === pinnedId` and also stores it. No schema change.
4. **Runner (A4).** `server/src/connectors/github/github.runner.ts`: `refreshSource(workspaceId, actor, sourceId)` loads the source, checks approval (BACK-131 policy) and `hasActiveGrant` **before each transport call** (a wrapping transport that re-checks per request), runs `observeRepository`, then `ingest` (which share-locks the grant). A revoke committed mid-run stops further calls; whatever was read before the revoke is refused by `ingest` or hidden by the grant check on read. The runner is added to the BACK-131 caller guard allowlist (it is the one sanctioned production caller of `ingest`).
5. **Trigger (decision S).** Recommended: an in-process scheduler, **off unless configured** (`KAWALYS_GITHUB_REFRESH_MINUTES`, minimum 15), one run at a time, no new HTTP route. Alternative: an owner-only `POST /sources/:id/refresh` route (BACK-172 limiter, reauthorization) or an operator CLI on the host.
6. **Initial binding.** The source row and grant are created once through `connectSource` (BACK-131: approved identity only) by an operator command `npm run source:connect` on the host, refusing in non-loopback/ production unless the approved identity with id is configured. No route.

## 4. Tests (slice A, red first, no network)

- Transport: GET only (a non-`/repos/<ref>` path or any write throws before fetch); headers; redirect -> `unexpected_status`; timeout and network -> `GitHubTransportFailure`; token never appears in errors or thrown messages.
- Token: JWT claims and algorithm (verify with the matching test public key); mint body is exactly the down-scoped permissions and the one repository id; renewal before expiry; mint 401/403 -> `denied`, 5xx/network -> `unavailable`; private key never echoed.
- Pinned id: `id` mismatch -> `id_mismatch` error observation, nothing `ok`; missing id in config -> runner refuses to start.
- Runner (real PG18.7): grant revoked before the run -> zero transport calls; revoked between two calls (spy transport) -> no further calls and nothing readable; unapproved identity -> zero calls; happy path -> observations ingested and readable through the existing readers; cross-workspace source id -> refused with zero calls.
- Caller guard updated: only the runner (plus repository and local seed) may call `ingest`.
- Leak checks: no token, key, or Authorization header in logs, audit rows or observation payloads.

## 5. Activation (NOT in slice A; each step needs your explicit go-ahead)

1. **You** choose the one repository and give its `owner/repo` and numeric id.
2. **You** create a GitHub App (Repository permissions: Metadata read, Pull requests read, Issues read; nothing else; no webhooks), install it on **that repository only**, and note the App id and installation id.
3. **BACK-128** decides where the App private key lives and how it is rotated; nothing is pasted in chat, Jira or the repo.
4. Deploy (with your approval) a release containing slice A, set `KAWALYS_APPROVED_SOURCES` (with the id) and the App settings, bind the source once, run one refresh, and record the evidence: one real permitted observation, the down-scoped token permissions, a revoke followed by zero calls, and no token in logs.

## 6. Decisions for the owner (slice A)

| # | Decision | Recommendation |
| --- | --- | --- |
| P | Token approach | **GitHub App installation token, down-scoped per mint** to the one repository id and three read permissions (not a personal access token) |
| Q | Immutable id | **Pin the numeric repository id in `KAWALYS_APPROVED_SOURCES`** (`github:owner/repo#id`); no schema change |
| S | How refreshes run | **In-process scheduler, off unless `KAWALYS_GITHUB_REFRESH_MINUTES` is set (min 15), no new route.** Alternatives: owner-only refresh route, or host CLI |
| T | Initial binding | **Operator command `npm run source:connect`** on the host, through the BACK-131 policy; no route |
