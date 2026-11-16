# 06 — G2 vertical slice: test plan

Status: **Plan.** No repo or CI failure is accessed until the owner authorises one (07 §8).

## 1. Candidate source (owner chooses one)

| Candidate | Pros | Cons |
| --- | --- | --- |
| **A. `Kemetra-Labs/Backstage-OS`, workflow `CI`** (recommended) | Our own repo, no product or tenant data, one known workflow with real history (PR #3, #4). A failing run can be produced on a throwaway branch without touching any product, **but that is a push to the repo and needs its own approval** (07 §8 item 8). Alternative: use an existing failed run from history | Not the Retail Tower story the S1 fixture simulates |
| B. A Retail Tower repo's CI | Matches the `INV-DEMO-7` scenario | Product repo; more owners and more care; logs may carry environment details |

Recommendation: **A** for the first slice, B as the next increment once A passes.

## 2. Trace to prove

GitHub workflow run / job (source)
→ `RawCheck` (adapter)
→ `Observation` + `EvidenceReference` (`observed`, with `observedAt`, `ingestedAt`, `sourceUrl`)
→ `component` (e.g. `ci` component of the project)
→ `InvestigationData` (one case)
→ direct link back to the GitHub run.
Any root-cause text stays `hypothesis`, never `observed`.

Jira is **out of scope** for this slice (separate increment).

## 3. Positive tests

| ID | Test | Pass condition |
| --- | --- | --- |
| P1 | Successful run, current | `observed`, `current`, health may be `healthy` |
| P2 | Failing run | `observed`, health `down`, link opens the exact run on github.com |
| P3 | Provenance | Every evidence item has provider, repo, `head_sha`, `observedAt`, `ingestedAt`, `sourceUrl` |
| P4 | Hypothesis separation | Root-cause text is labelled hypothesis in UI and API |
| P5 | EN/AR | Same case renders in both; GitHub IDs isolated LTR |

## 4. Negative test matrix

| ID | Condition | Expected |
| --- | --- | --- |
| N1 | Source not configured for project | `not_configured`, freshness `unknown`, health `unknown` |
| N2 | GitHub unreachable / timeout | `unavailable`; cached data `stale`; never `healthy` |
| N3 | Data older than TTL | `stale`; `healthy` downgraded to `unknown` (`resolveHealth`) |
| N4 | Connector credential revoked / rejected (GitHub 401, or 403 **without** `retry-after` and with remaining > 0) | `unavailable` (reason `auth_rejected`); not a user 403; no automatic retry loop |
| N5 | Rate limited (403 or 429 **with** `retry-after` or `x-ratelimit-remaining: 0`) | `unavailable` (`rate_limited`); fake server counts requests: none until `retry-after` / reset has passed |
| N6 | Caller lacks project scope | HTTP 403/404; no body data; audit row written |
| N7 | Nontechnical role | Restricted evidence arrives as `observation: null`, `notReadReason: 'restricted'` in the **network response**, not just hidden |
| N8 | Cross-project | Request for project B with project A's scope → denied; cache not shared |
| N9 | Zero runs for ref | `unknown`, "no checks found"; never healthy |
| N10 | Queued / in progress | `unknown` |
| N11 | Run or job conclusion `cancelled` / `neutral` / `skipped` / `action_required` / `stale` / null / any unlisted value | `unknown` |
| N11b | Run `success` but one job `failure` | `down` (worst of run and jobs) |
| N12 | Pagination stopped early | Count shows "at least N" (`atLeast: true`) |
| N13 | One source read, one not | Count "at least N", `sourcesRead < sourcesTotal`; unread never shown as 0 |
| N14 | Malformed upstream item | That item `unavailable`; rest of response intact |
| N15 | `sourceUrl` host not `github.com` | Dropped by server allowlist; link rendered inert |
| N16 | Secret-looking string in any text field | Redacted or absent (G2 default: no logs fetched) |
| N17 | Browser network tab | No request to any host but the BFF; no token in any response |

## 5. Test layers

- **Unit**: normaliser mapping table (03 §6), every row; rule parity server vs client.
- **Contract**: recorded GitHub JSON fixtures (sanitised, checked in) → adapter → normaliser; same fixtures for a
  future MCP adapter.
- **Integration**: BFF with a fake GitHub server (status codes, headers, latency) for N2, N4, N5, N12, N14.
- **E2E**: Playwright against BFF + fake GitHub; N7 and N17 assert on network responses.
- **Live smoke** (only after approval): one read against the chosen repo, read-only token, result recorded.
- **Security**: dependency audit, secret scan, an authz test per endpoint (every role × every project).
