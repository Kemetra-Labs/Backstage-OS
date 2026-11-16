# 03 — API and evidence contracts (read-only)

Proposal for review. No endpoint exists. Type names refer to `app/src/contract/types.ts` at `c853feb`.

## 1. Display contract vs wire contract

`types.ts` says of itself: *"Shapes a screen renders, not a schema or an API."* G2 needs a **wire contract** (what the
BFF returns) that maps onto it without loss. Two differences are deliberate:

| Display field | Wire contract | Why |
| --- | --- | --- |
| `SourceAuthority.ageMinutes` (precomputed for the fixture) | **Dropped.** Send `lastSuccessAt` + response-level `asOf` (server clock). Client computes age | Precomputed ages go stale in the client and hide clock skew |
| `SourceAuthority.synthetic` | Kept. Always `false` for real reads; `true` only for fixtures | `needsDemoMarker` and `isInertLink` depend on it |
| `InvestigationData` (the ticket calls it "Investigation") | Same shape, plus `asOf` and `scope` | Name kept to avoid churn |
| `EvidenceReference.visibility` | Kept, but restricted evidence never leaves the server with its observation (§5) | Client-side redaction is presentation only |

The server applies the same rule functions (`effectiveFreshness`, `resolveLabel`, `resolveHealth`, `countDisplay`)
before responding, as defence in depth. The client keeps applying them too. A server and a client that disagree is a
test failure.

## 2. Type mapping (accepted S1 types)

| Type | Wire meaning for G2 (GitHub CI) |
| --- | --- |
| `TruthLabel` | Connector output is only ever `observed`. `correlated` needs a written `rule`. `hypothesis` is anything inferred (e.g. root cause). `proposed` / `approved` are never produced in G2 |
| `Connectivity` | State of the **connector**, not the target: `reachable`, `unavailable` (+ reason), `not_configured` |
| `Freshness` | From `lastSuccessAt` and the source TTL (`freshnessOf`). Never `current` without a successful read |
| `Health` | Target health. `healthy` only with current Observed evidence (`resolveHealth`). See §6 for the GitHub mapping |
| `Observation` | One normalised GitHub fact: `target` (EntityRef `check`), `source`, `observedAt` (GitHub `completed_at` / `updated_at`), `ingestedAt` (BFF read time), `environment: 'ci'`, `sourceUrl` (GitHub `html_url`) |
| `EvidenceReference` | Wraps an Observation, or `observation: null` + `notReadReason` |
| `SourceAuthority` | One per configured provider in the project scope, including ones that failed |
| `AggregateCount` | E.g. failing checks: `value`, `sourcesRead`, `sourcesTotal`, `atLeast` (true when pagination stopped early) |
| `ConfidenceBasis` | Not produced in G2 (no inference engine). Hypotheses stay word-level (`confidenceDisplay`) |
| `Investigation(Data)` | One case, grouping component, sources, evidence and an explicit `hypothesis` |

## 3. Endpoints (read-only, all `GET`)

| Endpoint | Returns |
| --- | --- |
| `GET /api/v1/projects` | Projects the caller may see: `{ id, label }[]`. Never lists others |
| `GET /api/v1/projects/{projectId}/sources` | `SourceAuthority[]` for that project |
| `GET /api/v1/projects/{projectId}/components/{componentId}/checks?ref=` | `{ asOf, source, evidence: EvidenceReference[], failing: AggregateCount }` |
| `GET /api/v1/projects/{projectId}/investigations/{id}` | `InvestigationData` + `asOf` |

Common envelope: `{ ok: true, data, asOf }` or `{ ok: false, error: { code, message } }`. Messages are generic and
never echo upstream payloads, tokens or internal URLs.

## 4. Errors vs evidence states

Two kinds of "denied" must not be confused:

| Situation | Response | Evidence state |
| --- | --- | --- |
| Caller not signed in | HTTP 401 | none returned |
| Caller lacks scope for the project / component | HTTP **403** (or 404 to avoid confirming existence; ADR-03 decides) | none returned. This is **not** an evidence state |
| Source not configured for this project | 200 | `connectivity: 'not_configured'`, `freshness: 'unknown'`, evidence `notReadReason: 'not_configured'` |
| GitHub rejects the **connector's** credential (401/403), repo not found, network error, timeout | 200 | `connectivity: 'unavailable'` + reason code; last cached observation (if any) shown as `stale` |
| GitHub rate limit (403 or 429 with rate-limit headers) | 200 | `unavailable` (reason `rate_limited`), retry after reset; cached data `stale` |
| Evidence exists but the caller's role may not see it | 200 | `observation: null`, `notReadReason: 'restricted'` |

None of these may produce `healthy`. All of them render as unknown / stale / not read.

Telling a GitHub 403 apart: GitHub uses 403 **and** 429 for rate limits. Treat a response as `rate_limited` when it
has a `retry-after` header or `x-ratelimit-remaining: 0`; treat any other 401/403 as `auth_rejected`. Either way the
result is `unavailable`; the split only decides backoff (wait for reset vs. alert the owner about the credential).

## 5. Restricted evidence is cut on the server

Today `app/src/view/viewFor.ts` hides `visibility: 'technical'` evidence from non-technical personas **in the
browser**. With real data, the BFF must drop the observation before serialising: the client receives
`{ id, classification, freshness: 'unknown', visibility, observation: null, notReadReason: 'restricted' }`.
Raw output (`rawOutput.text`, CI logs) is never sent to non-technical roles and is redacted for everyone (ADR-03 §5).

## 6. GitHub → contract normalisation

G2 reads **workflow runs and their jobs** (ADR-04 §4). Fields per the GitHub REST docs fetched 2026-11-16:

| Object | status / conclusion | Time fields | Link |
| --- | --- | --- | --- |
| Workflow run | `status` and `conclusion` are strings or null; the response schema gives **no enum**. The `status` *filter* accepts `completed`, `action_required`, `cancelled`, `failure`, `neutral`, `skipped`, `stale`, `success`, `timed_out`, `in_progress`, `queued`, `requested`, `waiting`, `pending` | `created_at`, `updated_at` (required), `run_started_at` (optional) | `html_url` (required) |
| Job | `status`: `queued`, `in_progress`, `completed`, `waiting`, `requested`, `pending`. `conclusion`: `success`, `failure`, `neutral`, `cancelled`, `skipped`, `timed_out`, `action_required`, null | `started_at`, `completed_at` (nullable) | `html_url` (**nullable**) |

`observedAt` = job `completed_at`, else run `updated_at` (for a run with no completed jobs). `ingestedAt` = BFF read
time. A job with `html_url: null` uses the run's `html_url`.

Mapping (runs and jobs alike; anything not listed is `unknown`):

| GitHub state | Observation | Health contribution |
| --- | --- | --- |
| `completed` + `success` | observed | may support `healthy` if current |
| `completed` + `failure` / `timed_out` | observed | `down` (failing check) |
| `completed` + `cancelled` / `neutral` / `skipped` / `action_required` / `stale` | observed | **`unknown`**: not healthy, not failing |
| `queued` / `in_progress` / `waiting` / `requested` / `pending` | observed (state only) | **`unknown`** |
| zero runs found for the ref | no observation | **`unknown`** ("no checks found", never healthy) |
| any other or null value | observed | **`unknown`** (fail safe; the run schema has no enum, so new values must not default to healthy) |
| run `success` but a job not `success` | observed | the job's mapping wins (worst of run and jobs) |

Links: `sourceUrl` must be `https://github.com/{owner}/{repo}/...` for the configured repo. The BFF rejects any other
host before sending. This server check is needed because the client's `isInertLink` stops blocking links once
`synthetic` is false.

## 7. Safe fallback

If normalisation fails for one item, that item becomes `observation: null` with reason `unavailable` and the rest of
the response is still returned. If the whole read fails, return the last cached read marked `stale`, or nothing marked
`unknown`. Never return a default object with `health: 'healthy'`.
