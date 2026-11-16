# ADR-04 — Connector model: swappable adapters, GitHub REST vs GitHub MCP

Status: **Proposed — owner decision required.** Architecture v1 §14 ADR-04 (scoped to the G2 read-only CI case).
No credential was used and no GitHub API was called for this document; facts come from public docs fetched
2026-11-16 (links in §8). Items not confirmed there are marked **unverified**.

## 1. Rule

The browser never talks to GitHub, an MCP server or any source. It talks only to the Kawalys BFF. Source credentials
and MCP sessions live server-side only.

## 2. Adapter boundary

```
UI ──HTTPS──> BFF (auth, scope, cache, normalise, audit)
                 └── SourceAdapter (interface)
                       ├── GitHubRestAdapter      (G2 candidate)
                       ├── GitHubMcpAdapter       (alternative, same interface)
                       └── WebhookIngest          (later; push → same normaliser)
```

## 3. Adapter contract (TypeScript sketch, for review only)

```ts
interface SourceAdapter {
  readonly provider: Provider;                          // 'github'
  describe(): { transport: 'rest' | 'mcp' | 'webhook'; ttlSeconds: number };
  // Read-only. Must never throw past the boundary; failures come back as data.
  readChecks(req: {
    projectId: string; repo: { owner: string; name: string }; ref: string;
    maxPages: number; signal: AbortSignal;
  }): Promise<ReadResult<RawCheck[]>>;
}

type ReadResult<T> =
  | { ok: true; items: T; complete: boolean; fetchedAt: string; rate?: RateInfo }
  | { ok: false; reason: 'not_configured' | 'auth_rejected' | 'not_found' | 'rate_limited'
        | 'timeout' | 'network' | 'malformed'; retryAfterSeconds?: number; fetchedAt: string };

interface RawCheck {  // transport-neutral; normaliser maps this to Observation (03 §6)
  externalId: string; name: string; headSha: string;
  status: string; conclusion: string | null;
  startedAt: string | null; completedAt: string | null; htmlUrl: string;
}
```

`RawCheck` is filled from a workflow **job** (falling back to its run); field mapping in 03 §6. `complete: false`
means pagination stopped early → `AggregateCount.atLeast = true`. One shared normaliser turns
`RawCheck` into contract types, so REST and MCP adapters cannot disagree on "healthy".

## 4. Which GitHub read path

| Path | Fine-grained PAT | Notes |
| --- | --- | --- |
| `GET /repos/{o}/{r}/actions/runs` and `.../runs/{id}/jobs` | Listed under **"Actions" (read)** | Covers GitHub Actions only |
| `GET /repos/{o}/{r}/commits/{ref}/status` | Listed under **"Commit statuses" (read)** | Legacy statuses from external CI |
| `GET /repos/{o}/{r}/commits/{ref}/check-runs` | **Not listed** on the fine-grained PAT permissions page | Classic PAT/OAuth need `repo` scope for private repos (over-broad). GitHub App "Checks: read" is the likely path — **unverified** |

Proposal for G2: **Actions workflow runs + jobs** with a GitHub App installation (or fine-grained PAT for the pilot)
limited to **one repository, Actions: read and Metadata: read** only. The permissions page lists a read-only
"Metadata" section (e.g. `GET /repos/{owner}/{repo}`); whether GitHub adds it automatically is **unverified**. The
runs and jobs pages themselves state no fine-grained permission (they say classic tokens need `repo` for private
repos); the "Actions: read" mapping comes from the permissions page. Check runs via a GitHub App can be added later
if non-Actions CI matters. Note: run searches with filters return at most 1,000 results; G2 reads one ref, far below.

## 5. REST vs MCP for this read-only CI case

| Criterion | GitHub REST (direct) | GitHub MCP server |
| --- | --- | --- |
| Auth scopes | Fine-grained PAT or GitHub App installation, one repo, Actions read | Remote server `https://api.githubcopilot.com/mcp/` takes OAuth or a PAT bearer; local server takes `GITHUB_PERSONAL_ACCESS_TOKEN`. Same token underneath, plus the MCP server as an extra party holding it (remote) |
| Restricting to read | Token permissions alone | Token permissions **plus** read-only mode: `--read-only` / `GITHUB_READ_ONLY=1` (local), `X-MCP-Readonly` header or `/x/actions/readonly` path (remote). Toolset limit: `X-MCP-Toolsets` / `--toolsets actions` |
| Data parity | Full documented JSON | `actions_list` / `actions_get` cover workflow runs and jobs. README: clients on protocol `2026-07-28`+ get structured objects with compact projections that **omit API URLs but keep browser links, IDs, states and timestamps**; older clients get text. Check runs only via `pull_request_read` → `get_check_runs` (PR head commit only). Whether every field in §3 survives the projection: **unverified** |
| Pagination | `per_page` ≤ 100 + `page`; explicit and testable | Tool-level paging; behaviour per tool **unverified** |
| Rate limits | Headers visible to the BFF: `x-ratelimit-remaining`, `-reset`, `-resource`, `retry-after`. 5,000/h per PAT; 5,000+/h per App installation; secondary 900 points/min REST, 100 concurrent | Same GitHub limits apply to the token, but whether the MCP layer passes the headers to the caller: **unverified (likely not)**. Without them the BFF cannot back off precisely |
| Conditional requests (ETag / 304) | Available to the BFF. Docs fetched do not state whether 304s count against the limit: **unverified** | Not exposed to the caller as far as the docs show |
| Retries / timeouts | BFF owns them (honour `retry-after`, else ≥ 60 s, exponential, capped attempts — per GitHub docs) | Two layers of retry (BFF and MCP server); harder to reason about |
| TTL / caching | BFF cache keyed by repo + ref, TTL per source | Same, but no ETag shortcut |
| Observability | Every upstream call is one HTTP request the BFF logs | Extra hop; MCP server logs not under our control (remote) |
| Maintenance | Stable versioned REST (`X-GitHub-Api-Version`) and an official client | Fast-moving tool surface (insiders mode, protocol-dependent output) |
| Reliability | One dependency (GitHub API) | Two (MCP server + GitHub API) |
| Risk | Small, typed surface | Larger tool surface; `get_job_logs` returns raw logs (secret exposure risk, ADR-03 §5); write tools exist if read-only is misconfigured |

## 6. Recommendation

**GitHub REST adapter for G2**, behind the `SourceAdapter` interface. Reason: for a narrow, read-only, typed CI read,
REST gives the BFF the rate-limit headers, pagination control and stable fields that the evidence/freshness contract
needs, with one fewer party holding the credential. **Keep the MCP adapter as a later, swappable option** (same
interface, same normaliser), worth reconsidering when Kawalys needs broad, exploratory or agent-driven reads (G3+).

## 7. Not decided / to verify before acceptance

- GitHub App vs fine-grained PAT for the pilot (App is preferred for production; PAT may be acceptable for a
  time-boxed lab pilot with expiry ≤ 30 days — owner decides).
- Webhooks (`workflow_run`, `check_run`) vs polling. G2 proposal: polling with TTL; webhooks need a public endpoint
  and secret validation, so they wait for hosting (ADR-08).
- All **unverified** cells in §4–§5 must be confirmed from docs or a sandbox read before this ADR is accepted.

## 8. Sources (fetched 2026-11-16)

- https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
- https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run
- https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference
- https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://github.com/github/github-mcp-server (README) and `docs/remote-server.md`
