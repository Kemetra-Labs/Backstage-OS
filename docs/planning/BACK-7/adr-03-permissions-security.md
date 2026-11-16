# ADR-03 — Permissions, scope and security (G2 read-only)

Status: **Proposed.** Architecture v1 §9 and §14 ADR-03. Identity provider and session technology stay **open**.

## 1. Principles

- Authorisation happens on the server for every request and every background read. UI persona filtering
  (`app/src/view/viewFor.ts`) is presentation only and is never relied on for real data.
- Source truth stays in GitHub / Jira / Confluence. Kawalys stores references and short-lived observations, not copies
  of authority. Port is optional context (ADR-05), never a permission source.
- Internal staff only. Customers never sign in (repo `CLAUDE.md`, Architecture v1 §1).

## 2. Scope model

Every request resolves to a **scope tuple** before any data access:

`(user, role, project, environment, tenant?)`

| Dimension | G2 rule |
| --- | --- |
| user | Authenticated staff identity from the chosen IdP (open). No anonymous or guest access |
| role | `owner` / `technical` / `nontechnical`, assigned **per project** server-side (not a global client flag) |
| project | Explicit allowlist per user. The connector config is per project: project → `{ owner, repo }`. A request for project A can never read project B's repo or cache entry (cache key includes `projectId`) |
| environment | G2 reads only `ci`. Production telemetry is out of scope |
| tenant | Not applicable to G2 (no tenant data). Any future tenant data requires its own ADR |

Deny by default: a missing mapping is refused (403 or 404, see §7), never an empty "all clear".

## 3. Role → data

| Data | owner | technical | nontechnical |
| --- | --- | --- | --- |
| Project list, source states, freshness | yes | yes | yes |
| Check names, states, links to GitHub | yes | yes | plain-language summary only (matches S1 redaction rules) |
| Job names, run IDs, PR IDs | no by default | yes | no |
| Raw output / log excerpts | no by default | redacted excerpt only | never |

Restricted items are removed **before serialisation** (03 §5).

## 4. Credentials and secrets

- One credential per source per project, least privilege: one repo, **Actions: read** (+ Metadata: read; whether
  GitHub adds Metadata automatically is unverified, ADR-04 §4). No write,
  no admin, no org-wide scope. Prefer a GitHub App installation; a fine-grained PAT only for a time-boxed pilot with
  an expiry.
- Stored in a secret manager (choice tied to hosting, ADR-08). Never in the repo, `.env` files committed, the browser,
  logs, screenshots, AI prompts or test reports. Startup fails closed if the secret is missing.
- Rotation documented; revocation tested once in the pilot.
- No credential in URLs or query strings.

## 5. Raw output and logs

CI logs can contain secrets and personal data. Before any excerpt reaches a browser:

- Size limit (e.g. last 4 KB of the failing step; exact number decided in the implementation ticket).
- Redaction pass for token patterns (GitHub `gh*_` tokens, `Bearer …`, `key=`/`password=` pairs, URLs with
  userinfo `scheme://user:pass@`). Redaction must not deny-list by variable **name** only: a password inside a URL
  (e.g. `DATABASE_URL=postgres://user:pw@host`) has no "secret" word in its name and slips through.
- G2 default: **do not fetch logs at all**. Show check states and link to GitHub, where GitHub's own permissions
  apply. Log excerpts are a separate approval.

## 6. Audit, logging, backoff, provenance

- Audit record per request: who, scope tuple, endpoint, result code, number of evidence items returned, request ID.
  No response bodies, no tokens.
- Upstream call log: provider, endpoint template, status, rate-limit remaining/reset, duration. No auth headers.
- Backoff per GitHub guidance: honour `retry-after`; at `x-ratelimit-remaining: 0` wait until reset; otherwise ≥ 60 s,
  exponential, capped. A circuit opens after N failures and the source shows `unavailable`.
- Provenance on every Observation: provider, repo, ref / `head_sha`, `observedAt`, `ingestedAt`, `sourceUrl`.

## 7. Open

Identity provider and session mechanism; where role/project mappings live (config file vs database, ADR-02);
audit retention period; whether 403 or 404 is returned for out-of-scope projects (recommend 404 to avoid
confirming existence, owner decides).
