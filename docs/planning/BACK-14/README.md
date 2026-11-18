# BACK-14 — Retail Tower reuse audit for Kawalys (planning only)

Jira: [BACK-14](https://rahmaqanater.atlassian.net/browse/BACK-14) (parent BACK-1, context BACK-7). Written
2026-11-18 on branch `claude/back-14-reuse-audit-a3a046` from Backstage-OS `origin/main` at `ebb3585`.

**This is an audit and a plan, not an implementation.** No code was copied, migrated, built or tested in Kawalys. No
Retail Tower (RT) file, branch, ticket or config was changed. No Descope, MCP, GitHub API or AI model was called.
BACK-14's exclusions list "no git edits/commits/push/PR"; this docs-only PR was made on the owner's instruction relayed
by the starting session, to keep a repo copy next to the BACK-7 docs. It changes nothing outside `docs/`.

## 0. Relation to the Confluence audit, and the re-verified pin

The audit was first published on Confluence as
[page 79724624, v2](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/79724624) (child of the Kawalys ADR
80085048), pinned to RT `main` at `162e53c`, with Jira comments 17326 and 17328 on BACK-14. This file is the repo copy,
**re-pinned and re-checked against current RT `main`**:

| Source | Confluence v2 pin | This doc's pin |
| --- | --- | --- |
| Retail-Tower-Erp `main` | `162e53c6053a90add24ded2d678dd194b4d7b8ad` (2026-11-16) | `b9ba5276304f0da9d0525e569ae0be581b005855` (2026-11-18, 36 commits later) |
| Backstage-OS `main` | `288d6a8` (BACK-7 docs) | `ebb3585` (adds the synthetic frontend #7, CI timeout #11) |

**RT permalink base:** `https://github.com/Kemetra-Labs/Retail-Tower-Erp/blob/b9ba5276304f0da9d0525e569ae0be581b005855/<path>`.
Every RT path below resolves against it. The "Last change" column is the short sha of the last commit that touched the
file at that pin, for history only.

### What changed between the two pins (for cited files)

| File | Change | Effect on this audit |
| --- | --- | --- |
| `services/backend-core/apps/api/src/auth/external-credential.port.ts` | RT-1439 (`831588367`) adds `verifyPassword` and `endSession`, with a `VerifyPasswordResult` union `ok` / `refused` / `unavailable` | Class stays **D now / C later** (I7). It adds one more example of the result-kind discipline (§2.1) |
| `services/backend-core/apps/api/src/idempotency/canonical-json.ts` | Comment-only path fix (`fca942060`) | None |
| All other cited source files (I1–I9, S2, S5, M1–M2, O1–O4, `users.ts`, `LICENSE`) | `git diff 162e53c b9ba527` is empty | Findings carry over unchanged |

### Method and evidence labels

- RT was read only with `git show <sha>:<path>`, `git ls-tree`, `git log` and `git diff` against
  `C:\Users\user\Documents\GitHub\Retail-Tower-Erp` (one `git fetch` of `origin/main`, no checkout, branch or edit).
- **Tests:** "N cases" is a count of lines matching `it(` / `test(` (including `.each`) in the spec file at the pin.
  **No test was run.** Counts differ slightly from Confluence v2 (for example 30 vs 26 for the Descope verifier spec,
  13 vs 12 for selection) because the grep pattern differs; neither number is a pass count.
- **Unverified label:** anything marked *(carried from Confluence v2, not re-verified)* was taken from the
  Confluence audit at `162e53c` and was not re-checked in this pass. This covers the npm licence lookups, the RT-791
  comment history, and the depth notes on files Confluence itself marked "not inspected in depth".
- RT licence: Apache-2.0 (root `LICENSE`, re-checked at the pin). Both products share the copyright holder, so
  internal reuse is an owner decision, not a licence problem. Keep attribution in any copied file.
- Jira re-checked 2026-11-18: RT-643, RT-791, RT-796, RT-800 **Done**; **RT-798 and RT-799 still To Do**.

## Acceptance criteria map

| BACK-14 acceptance item | Where | Status |
| --- | --- | --- |
| Inventory current RT code and architecture with exact refs, implementation vs documentation | §1 | Done at `b9ba527` |
| Classify candidates A/B/C/D with dependency / licence / security / test evidence | §2 | Done; licence column carried from Confluence v2 |
| Source separation and no-cross-project-secret / no-shared-tenant threat model | §3 | Done |
| Small Kawalys-only Identity Port, one adapter architecture, test fake, provider replaceability, scoped identity | §4 | Proposed for owner approval |
| Rank next reusable capabilities (Source/MCP, AI, Observability) by G2/G3 dependency | §5 | Done |
| Versioned common-leaf package only if two products need it and both approve | §6 | Recommendation: **not now** |
| Implementation slices and exact STOP conditions; nothing marked migrated or tested | §7 | Done; nothing migrated or tested |
| Child Confluence page under the Kawalys ADR + Jira comment; owner reviews before closeout | Confluence 79724624 v2, Jira comments 17326 / 17328 | Already done before this PR. The re-pin delta above is **not** yet on Confluence (owner follow-up, §9) |

## 1. Inventory: implemented in code vs only documented

| Area | Implemented on RT `main` | Documented, not implemented | Evidence |
| --- | --- | --- | --- |
| Identity port | `verifyIdentityToken` and `linkExternalIdentity` wired live | The 6 lifecycle methods (`getIdentityProfile`, `createIdentity`, `inviteUser`, `disableIdentity`, `enableIdentity`, `sendPasswordReset`) **reject with "not wired in D3"**; the 3 optional ones are not implemented | `services/backend-core/apps/api/src/auth/linking-identity-provider.adapter.ts:55,86` |
| Provider selection | Descope only; unknown values (including `clerk`) throw at boot | — | `.../auth/identity-provider-kind.ts`, `.../auth/identity-provider.factory.ts` |
| Clerk removal | Runtime path Descope-only, RT-800 Done | **RT-798 (OpenAPI wording) and RT-799 (drop `users.clerk_user_id`) are To Do.** The column is still mapped and still referenced by tests and the bootstrap CLI | `services/backend-core/packages/db/src/schema/users.ts:27`; `git grep clerk_user_id` hits e.g. `apps/api/test/_helpers/identity-links.ts`, `packages/db/src/cli/bootstrap-pilot.ts` *(CLI read/write carried from Confluence v2)* |
| Credentials | `ExternalCredentialPort` password sign-in, reset, invite, logout-all, and (new) `verifyPassword` / `endSession` | — | `.../auth/external-credential.port.ts` |
| AI | `ModelProviderPort`, disabled / fake / recorded adapters, result guard, token estimate, conformance suite, gateway | Vendor adapter, residency, SDK-vs-fetch left open (RT-643) | `.../ai/ports/model-provider.port.ts`, `apps/api/test/_helpers/model-provider-conformance.ts` |
| Observability | Sentry `beforeSend` scrubbers (Node backend, Node POS main, browser console, Python connector); OTel `RedactingSpanExporter`; shared golden vectors kept identical by `tools/contracts-check` | OBS-1 and AD-AI-PROV-001 are cited in code and docs only *(carried from Confluence v2)* | `packages/shared/src/observability/{sentry,span-redaction}.ts`, `apps/admin-console/src/observability/scrub.ts`, `tools/contracts-check/contracts_check/identical.py` |
| Source connectors | ERPNext connector (Python/Frappe), SES email adapter, idempotency, rate limit, health | **No first-party MCP code and no HMAC webhook verifier** | `integrations/erpnext-connector/...`; see note below |

**MCP note (precise):** RT has no first-party MCP client or server code. `@modelcontextprotocol/server@2.3.0` and
`@modelcontextprotocol/core@2.3.0` do appear in `apps/admin-console/pnpm-lock.yaml`, as transitive dependencies of the
`e2e@0.19.0` test package (alongside `ai` and `@ai-sdk/openai`). That is test tooling, not a connector, and nothing to
reuse. The ERPNext connector is an architecture example only, not a Kawalys integration candidate.

**Kawalys at `ebb3585`:** still no backend. It has the static prototype and the synthetic React `app/` with a typed
display contract (`app/src/contract/types.ts`: `Observation` line 31, `EvidenceReference` line 41) and synthetic
fixtures. BACK-7 ADR-01, ADR-03 and ADR-04 are **Proposed, not accepted**
([BACK-7 README](../BACK-7/README.md)).

## 2. Reuse matrix

### Reuse classes

| Class | Meaning |
| --- | --- |
| **A** | Copy a leaf file into Kawalys with a provenance header citing `Retail-Tower-Erp@<sha>:<path>` and Apache-2.0 attribution. **Never a runtime import from RT.** Kawalys owns the copy; no automatic sync. |
| **B** | Extract or adapt behind a Kawalys-named port. Shape and tests reused; names, framework and domain rewritten. |
| **C** | Design or test reference only. |
| **D** | Reject or not applicable. |

Ownership is the same for every row: RT owners own RT source; Kawalys owns any copy or adaptation. **No upstream
obligation in either direction.**

Paths below use `api/` for `services/backend-core/apps/api/` and `shared/` for `services/backend-core/packages/shared/`.

### 2.1 Identity

| # | Candidate | Last change | Status | Tests (not run) | Coupling (licence) | Data / auth assumptions | Class | Value, cost, risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I1 | `api/src/auth/identity-provider.port.ts`: **only** `VerifiedSubject {providerKey, issuer, subject}` + `verifyIdentityToken` | b3a7495fe | Live | Via selection / adapter specs | Pure TS types | Subject joined to a local user via a link table; no provider claim crosses the port | **B** | ~15-line contract. Rename to `IdentityVerificationPort.verify(rawToken) → VerifyResult` (§4) |
| I2 | Same file: 6 lifecycle + 3 optional methods | b3a7495fe | **Unimplemented** (reject "not wired") | — | — | POS / Console user-admin flows | **D** | Adopting it creates a mega-interface. Add an operation only when a Kawalys feature needs it |
| I3 | `api/src/auth/identity-provider-kind.ts` + `identity-provider.factory.ts` | 0c5fd7bf2 / f8b222abc | Live | `api/test/auth/identity-provider-selection.unit.spec.ts` (13 cases) | Factory imports pg `Pool` and Descope modules | Unknown provider fails closed at boot; `never` exhaustiveness | **C** | Re-derive the fail-closed parse as a ~20-line pattern. No factory family before a second provider exists |
| I4 | `api/src/auth/linking-identity-provider.adapter.ts` + `packages/db/drizzle/0025_external_identity_links.sql` + `api/src/auth/identity-link-lookup.ts` | b3a7495fe / f79b618e3 / b8b0681c1 | Live | Adapter unit / integration specs, `0025` migration spec *(carried from Confluence v2)* | PostgreSQL, FK to RT `users` | One active link per user; unique `(provider_key, issuer, subject)`. **The runtime lookup matches only `(provider_key, subject)` and ignores issuer, on purpose** (`identity-link-lookup.ts:21-23, 60-62, 74-75`) | **C** | The data model is the value (neutral local user ID + external linked subject). Kawalys has no DB choice yet (ADR-02 open). **Kawalys must look up the full verified triple including issuer**; do not port the issuer-omitting query |
| I5 | `api/src/pos-operators/descope-verifier.ts` (jose JWKS verifier) | 9b68e33aa | Live | `api/test/pos-operators/descope-verifier.unit.spec.ts` (30 cases) | `jose` 5.10.0 MIT *(licence carried)*, NestJS decorator only | RS256 allow-list, pinned `iss` / `aud`, `exp` / `sub` required, `maxTokenAge`, refresh tokens refused, causes dropped | **B** | Highest-value identity piece. Adapt the verifier and its refusal tests to Kawalys's own issuer / audience / JWKS, without RT's 8-hour POS policy. Unlike RT, distinguish JWKS outage (`unavailable`) from invalid token (`refused`) using safe error codes only |
| I6 | `api/src/auth/descope-identity-provider.adapter.ts` | 77c0a4436 | Live | `descope-identity-provider.adapter.unit.spec.ts` *(carried)* | Extends the pg-coupled linking base | Maps `sub` to a neutral subject | **C** | ~15 lines once I5 and the link store are separate. Rewrite |
| I7 | `api/src/auth/external-credential.port.ts` (+ `descope-auth.client.ts`) | 831588367 | Live; RT-1439 added `verifyPassword` / `endSession` | `descope-auth.client.unit.spec.ts` *(carried; not inspected in depth)* | Descope management / auth HTTP | Kawalys would hold passwords and management keys | **D now, C later** | Kawalys should use hosted IdP sign-in, not proxy passwords. Reuse only the result-kind discipline (`refused` / `unavailable` / `unconfigured`; an outage is never a wrong password) |
| I8 | `services/backend-core/packages/auth/src/types.ts` (branded IDs, `RawToken` vs `TokenHash`) | b6ddc755f | Live | — | Pure types | Tenant / store IDs, POS scope | **C** | Reuse the branded-ID technique for `UserId` / `ProjectId` / `RawToken`. Drop `TenantId`, `StoreId`, `pos` scope |
| I9 | Operator context resolver, fail-closed auth guard, RT grants, identity-link cutover CLI | various | Live | various | NestJS, pg, tenant context | POS / tenant / store semantics | **D** | Domain-bound. Kawalys keeps its own deny-by-default scope ([ADR-03 §2](../BACK-7/adr-03-permissions-security.md)) |

### 2.2 Source evidence and connectors

| # | Candidate | Last change | Status | Tests (not run) | Coupling | Class | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | `api/src/ai/ports/model-provider.port.ts`: the **result-kind union** pattern (expected conditions returned, not thrown; no retry in the adapter; no vendor types) | b2fd939bf | Live | See §2.3 | None | **C** | Matches BACK-7 [ADR-04 §3](../BACK-7/adr-04-connectors.md) `ReadResult` already. Confirms the design; nothing to copy |
| S2 | `api/src/console-rate-limit/circuit-breaker.ts` (threshold, open window, single probe, injected clock) | c62442ed0 | Live | `api/test/console-rate-limit/circuit-breaker.unit.spec.ts` (6 cases) | Plain TS class | **A, mechanism only** | Copyable leaf. Its RT caller `console-rate-limit.guard.ts` is **fail-open** (lines 22-24, 193, 208) and must **not** be reused for auth, source truth or authorisation. In Kawalys an open source breaker maps to `unavailable`, never healthy or a bypass |
| S3 | `integrations/erpnext-connector/retail_tower_erpnext_connector/connector/{http_transport,auth_circuit}.py` | cd35b444b | Live | `tests/test_http_transport.py`, `tests/test_auth_circuit.py` (pytest; not counted) | Python / Frappe | **C** | ADR-01 recommends a TS BFF. References: plain HTTP refused, unset token refused, 401/403 circuit with capped backoff, reset on credential rotation *(behaviour carried)* |
| S4 | `api/src/idempotency/canonical-json.ts` | fca942060 | Live | `payload-canonical-json.golden.unit.spec.ts` *(carried)* | Pure | **D for G2** | G2 is read-only. Revisit only if write-back appears (G4) |
| S5 | `api/src/health/health.service.ts` (per-check timeout, single in-flight run, fixed-value report) | ba33bee6a | Live | `api/test/health/health.http.integration.spec.ts` (5 cases) + unit spec | NestJS + pg | **C** | Good readiness shape for the BFF; rewrite on the chosen framework |
| S6 | `services/backend-core/apps/worker/src/email/{email,ses-email}.adapter.ts` | 085170d5b / cdecd769c | Live | `email.*.spec.ts` *(carried)* | NestJS; `@aws-sdk/client-sesv2` | **C** | No notification need in G2. Do not create a `NotificationPort` yet |
| S7 | `api/src/pos-pilot-releases/promotion-oidc.verifier.ts` (GitHub OIDC via jose, verdict not throw) | 73e2ef4f9 | Live | *(not inspected)* | jose | **C** | Possible reference if Kawalys ever accepts GitHub Actions OIDC. Not needed for G2 |
| S8 | Outbox, BullMQ consumers, device health, ERPNext posting idempotency | various | Live | many | pg, BullMQ, Frappe | **D** | Retail domain flows |
| S9 | MCP connector code | — | **Does not exist** (first-party; see §1 MCP note) | — | — | **D** | Kawalys's MCP evaluation is original work (§5) |

### 2.3 AI / model provider

| # | Candidate | Last change | Status | Tests (not run) | Coupling | Class | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | `api/src/ai/ports/model-provider.port.ts` (`ModelCapability`, `ModelRouteDescriptor`, `EvidencePack`, `ModelResult`) | b2fd939bf | Live | `api/test/ai/model-provider.conformance.spec.ts` (5 cases, drives the suite) | Pure TS | **B** | Reuse the capability / route / evidence / result-state design. Point `EvidenceItem` at Kawalys `EvidenceReference` / `Observation` so model citations are typed evidence refs. Drop RT examples |
| M2 | `api/test/_helpers/model-provider-conformance.ts` | b2fd939bf | Live | Is the suite (adapter-agnostic, network-free) | Jest-style globals | **B** | Highest-value AI asset: the gate any Kawalys model adapter must pass at G3 |
| M3 | `api/src/ai/adapters/{disabled,fake,recorded}`, `pre-call-checks.ts`, `ports/model-result-guard.ts`, `token-estimate.ts` | b2fd939bf / b885e4875 *(carried)* | Live | Via conformance; `token-estimate.spec.ts`, `vendor-import-boundary.spec.ts` *(carried)* | Pure TS | **B, at G3 only** | Depend on RT request / result shapes. Adapt per file when G3 is approved |
| M4 | `api/src/ai/gateway/*`, `ai.module.ts`, prompts, eval datasets | various | Live | `ai-gateway.*.spec.ts`, `eval/e1/*` *(carried)* | NestJS + RT domain | **D** gateway / **C** eval-harness shape | No RT prompts, data or budgets in Kawalys |

### 2.4 Observability and privacy

| # | Candidate | Last change | Status | Tests (not run) | Runtime / deps | Class | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | `shared/src/observability/span-redaction.ts` (`RedactingSpanExporter`) | 7616ae6d5 | Live | `shared/__tests__/observability/span-redaction.spec.ts` (32 cases) | Node; type-only OTel imports (Apache-2.0, *carried*) | **B, only if OTel is chosen** | Drops `gen_ai.*` content (lines 58-68) and URL query, but keeps `scheme//host/pathname` (line 103) and unconstrained attributes. Paths can carry repo / project / investigation IDs. Kawalys needs route templates and an attribute allowlist plus leak tests |
| O2 | `shared/src/observability/sentry.ts` (allowlist rebuild `scrubSentryEvent`, DSN gating, default-inert) | 67be171b3 | Live | `shared/__tests__/observability/sentry.spec.ts` *(carried)* | Imports RT `logger/pino`, `correlation`, release version; `@sentry/node` *(carried)* | **B** | Extract the scrub core; replace the tag allowlist. **Also exclude project, source, repo, user and investigation IDs**; RT's list excludes tenant / store but allows `route` values that may embed IDs |
| O3 | `apps/admin-console/src/observability/scrub.ts` (browser scrubber: JWT / URL / email / phone / bearer masking, scan cap) | f3665a71f | Live | `apps/admin-console/tests/unit/observability-scrub.test.ts` (20), `observability-scrub-vectors.test.ts` (3) | Browser code, `@sentry/react` *(carried)*; **tests run in Node (vitest)** | **B** | Best match for Kawalys's React UI. **Real-browser behaviour unverified.** Arabic-numeral phone masking unverified |
| O4 | `shared/__tests__/observability/rt879-redaction-vectors.json`, `obs1-golden-vectors.json` | f3665a71f / 910744a27 | Live; copies kept identical by `tools/contracts-check` | Used by the scrubbers | Data | **A (test data)** | Copy without comments inside JSON; provenance in an adjacent README / manifest with pinned sha and path. Extend with GitHub path, MCP / agent / prompt and Arabic vectors. Do not tie Kawalys CI to RT's identical-copy contract |
| O5 | `shared/src/logger/pino.ts`, `shared/src/observability/{correlation,otel}.ts`, `.specify/memory/redaction-matrix.md` | b2fd939bf / d8f9e8ef8 / 1eea4bd85 / b2fd939bf | Live | `shared/__tests__/logger/pino*.spec.ts` *(carried)* | pino, OTel SDK *(licences carried)* | **C** | The redaction matrix is a good reference; labels and instrumentation are RT-specific |
| O6 | `.gitleaks.toml` (triage allowlist: rule **and** file **and** value must match) | 2c485c45a | Live | CI `secrets.yml` *(not opened)* | gitleaks | **C** | Adopt the triage rule when Kawalys adds secret scanning |

## 3. Source separation and threat model

Provider authentication is never Kawalys authorisation. Accepting an RT Descope token would weaken Kawalys's
verification boundary even if a later local-link and per-project check still rejected the RT user.

| Threat | Required protection |
| --- | --- |
| Cross-product token | A **separate Kawalys Descope project**, required for live K-ID-1b (not for synthetic K-ID-0 / 1a). Pin Kawalys JWKS, issuer and audience. RT-shaped JWTs must fail offline tests |
| Wrong identity link | Only a verified full `(providerKey, issuer, subject)` resolves to exactly one active local link and enabled user; then server-side project / environment role before any Kawalys session. Missing, disabled, ambiguous or foreign links deny. Provider "admin" claims grant nothing |
| Cross-product sharing | No RT Descope project, credentials, sessions, tenant / store grants, identity links, database, secrets, lab URLs or runtime imports. Separate Kawalys config and secret paths. A future approved scoped API may read RT **as a source**, never as shared authority |
| Outage vs invalid credential | Keep `refused`, `unavailable`, `unconfigured` distinct internally, classified only from safe error codes. All deny; clients see no claims, tokens, subject existence or causes |
| Telemetry leak | Template URL paths and allowlist attributes, not just query strings. No repo / project / user / source / investigation IDs, source logs, MCP payloads, prompts, agent evidence or tokens in external telemetry |
| Live identity readiness | Before K-ID-1b: Descope entitlement, renewal / overage, region, sign-up / invitation, MFA, session lifetime, revocation, secret storage. Production never activates or falls back to a fake verifier or synthetic keys |

Productisation or cross-customer tenancy needs its own future ADR. RT tenancy does not silently become Kawalys's model.
Customers never sign in to Kawalys (BACK-1 owner clarification).

## 4. Proposed Kawalys identity design (for separate owner approval)

**Proposal only.** Shapes are illustrative; no database is chosen (ADR-02 open).

```ts
interface VerifiedSubject {
  readonly providerKey: string;
  readonly issuer: string;
  readonly subject: string;
}
type VerifyResult =
  | { kind: 'verified'; subject: VerifiedSubject }
  | { kind: 'refused' }
  | { kind: 'unavailable' }
  | { kind: 'unconfigured' };
interface IdentityVerificationPort {
  verify(rawToken: string, signal: AbortSignal): Promise<VerifyResult>;
}
```

**Chain:** verified JWT → full `(providerKey, issuer, subject)` → exactly one active Kawalys identity link → enabled
local user → authorised project / environment role → separate Kawalys session decision. Never authorise from provider
admin roles or client persona filtering.

- **One adapter:** a Descope-backed `IdentityVerificationPort` (adapted from I5) as the first candidate, in its own
  Kawalys Descope project.
- **Test fake:** a network-free `FakeIdentityVerifier` returning synthetic subjects and each failure kind; injectable in
  tests only, never selectable in production.
- **Selection:** one configured provider; unknown or malformed config fails closed at boot. No factory family, no
  plugin host, no automatic fake fallback.
- **Vendor exit:** local `userId` stays stable. Stage the new provider subject as a pending / inactive link, verify it,
  then on owner approval atomically disable old and activate new, revoke old sessions, keep audit lineage. Plan for
  partial failure / rollback, JWKS allowlists, stored references and billing before decommissioning the old provider.

## 5. Next reusable capabilities, ranked by G2 / G3 dependency

| Rank | Capability | Gate | Reuse |
| --- | --- | --- | --- |
| 1 | Identity + per-project scope | G2 | I1 (B), I4 (C) for the K-ID-0 fake first; I5 (B) for offline K-ID-1a; live Descope only in K-ID-1b |
| 2 | SourceEvidence / GitHub CI | G2 | BACK-7 `SourceAdapter` + `ReadResult`; S2 breaker (A, mechanism only). No RT MCP code exists. Open circuit → `unavailable` |
| 3 | Observability / privacy | G2, if the BFF exports logs or spans | O4 (A test data), O1 (B if OTel), O2 / O3 (B) |
| 4 | ModelInference | G3 | M1 / M2 / M3 (B) on Kawalys evidence contracts; disabled / fake first |
| — | Notifications | Not scheduled | S6 (C) reference only |

### MCP-first evaluation, evidence-selected transport

The owner's preferred **evaluation order** is MCP first, REST as an explicit fallback. BACK-7
[ADR-04](../BACK-7/adr-04-connectors.md) is still **Proposed** and recommends REST for G2 on field completeness,
pagination, rate-limit headers and credential exposure. This audit does **not** change ADR-04 by implication. Before
K-SRC-0 live work, evaluate MCP tool output against `RawCheck` with offline fixtures (then, only after separate
approval, a restricted lab check): run / job IDs, states, timestamps, URLs, SHA, complete paging, read-only scoped auth,
rate-limit / backoff visibility, failure behaviour, freshness / provenance, no raw logs. Use MCP if it passes; REST
behind the same interface if gaps are shown. Record the final transport in ADR-04. The BACK-7 eight-point gate
([07 §8](../BACK-7/07-next-implementation-proposal.md)) still applies to any real source or credential.

## 6. Shared package recommendation

**No shared Kemetra library now.** S2 is one small breaker and O4 a small vector set; O1 and M3 need Kawalys-specific
adaptation. A copy with a provenance header is cheaper than a package with versioning and security-update duties.

Consider a versioned shared **leaf** package only when two independently approved products need the same audited
behaviour **and both products approve the change**. It then needs its own ownership, Apache-2.0 provenance, semver, CI,
release, compatibility and rollback design. Never import RT application internals at runtime.

## 7. Implementation slices and STOP conditions

**Not authorised by BACK-14.** Each slice needs its own BACK ticket and explicit owner approval.

| Slice | Scope | Gate | Acceptance proof |
| --- | --- | --- | --- |
| K-ID-0 | `IdentityVerificationPort` + `FakeIdentityVerifier` + local user / project-role boundary; synthetic subjects, no signed JWT | ADR-01 / ADR-03 accepted for a lab stub; no network, Descope, secrets | Deny-by-default role / environment / link tests; foreign, missing, disabled identity rejected; no production fake path |
| K-ID-1a | Offline JWT / JWKS verification with generated keys and `jose` | K-ID-0; dependency approved; no remote JWKS | Signature / alg / `none` / HMAC confusion, iss / aud, exp / nbf / age, refresh-token, missing-sub, foreign-project tests; outage vs invalid classified without leaks |
| K-OBS-0 | O4 vectors + Kawalys telemetry allowlists; O1 only if OTel chosen | BFF logging / export approved | Paths, IDs, tokens, URLs, MCP / agent content and Arabic vectors show no leak |
| K-SRC-0 | MCP-first GitHub Actions evidence parity; one adapter behind `SourceAdapter`; optional S2 breaker | ADR-04 resolved + full BACK-7 gate before any live data or token | Mapping parity, paging, rate limits, read-only, project isolation, unavailable-on-circuit, freshness |
| K-ID-1b | Real hosted sign-in, separate Kawalys Descope project, isolated lab | K-ID-1a passing; entitlement, region, MFA, session, secrets decided; owner-approved lab | Owner-run lab sign-in; RT token refused; local project authorisation verified |
| K-AI-0 | Model port + conformance suite + disabled / fake adapters | G3 approved | Network-free conformance, typed evidence refs, safe fallback |

**STOP and return to the owner if:**

- Any RT code, config, docs, Descope project, keys, sessions, database, identities, tenant / store grants or private API
  would be changed or shared.
- A foreign issuer, RT token, provider admin claim, inactive / ambiguous link, unscoped project or test fake could grant
  Kawalys access.
- An unconfigured, stale or failed source could show as healthy, or an open circuit / limiter failure could bypass a
  check.
- Source URLs / paths, prompts, MCP output, CI logs, tokens, claims or project / repo IDs could reach external
  telemetry or client errors.
- A provider, credential, external call, new runtime dependency, region, shared package, migration or write outside the
  approved slice is needed.
- A security-relevant candidate changes after `b9ba527` and has not been re-audited.

## 8. Limits of this audit

- Nothing was executed. Test numbers are grep counts, not results.
- Real-browser behaviour of O3 is unverified (its tests run in Node).
- npm licences, the RT-791 comment history and files Confluence marked "not inspected in depth"
  (`descope-auth.client.ts`, `promotion-oidc.verifier.ts`, `tools/agent-broker`) are carried from Confluence v2, not
  re-verified.
- Descope plan, overage and renewal need owner input.
- **Nothing was migrated or tested in Kawalys.**

## 9. Open owner decisions

1. Accept or reject the A / B / C / D classes in §2.
2. Approve (or not) the K-ID-0 slice; it needs ADR-01 and ADR-03 under the BACK-7 gate.
3. Descope entitlement, overage and renewal input, and an owner-created separate Kawalys Descope project (for K-ID-1b).
4. Resolve ADR-04 (MCP vs REST) after the MCP-first evaluation in §5.
5. Whether to add the `162e53c → b9ba527` re-pin delta (§0) to Confluence page 79724624; this PR does not edit
   Confluence or Jira.
