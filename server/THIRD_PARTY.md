# Third-party provenance

Code in this directory that originates elsewhere is listed here.

| Retail Tower path | Donor SHA | Kawalys path | Change |
| --- | --- | --- | --- |
| `services/backend-core/packages/shared/src/errors/envelope.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/src/errors/envelope.ts` | None below a 3-line provenance header |
| `services/backend-core/packages/shared/__tests__/errors/envelope.spec.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/test/errors/envelope.spec.ts` | None below a 3-line provenance header (the import path already resolved, so it is unchanged) |
| `services/backend-core/packages/db/src/middleware/tenant-context.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/src/db/workspace-context.ts` | Adapted: GUC `app.current_workspace`, platform-admin flag and NIL sentinel removed, `beforeCommit` hook dropped |
| `services/backend-core/packages/db/__tests__/rls-coverage.invariant.spec.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/test/db/rls-coverage.invariant.spec.ts` | Adapted: `workspace_id` scope, schema `kawalys`, global-table list, scoped-policy check, no exemptions, no Docker skip |
| `services/backend-core/packages/db/drizzle/0034_audit_events_append_only.sql` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/migrations/0001_foundation.sql` (audit trigger section) | Adapted: retention-marking and FK `SET NULL` exceptions removed |
| `services/backend-core/apps/api/src/audit/audit-row.writer.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/src/audit/audit-row.writer.ts` | Adapted: workspace instead of tenant, no store, id from DB default, single-row insert only |
| `services/backend-core/docs/operations/database-roles.md` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/src/db/runtime-role.ts`, `server/src/db/provision.ts` | Reference only (pattern), no text copied |
| `services/backend-core/packages/auth/src/tokens.ts` | `b6ddc755f07a10165b2365a7307001e5fadea84d` | `server/src/auth/tokens.ts` | None below a 3-line provenance header (COPY) |
| `services/backend-core/packages/auth/__tests__/tokens.spec.ts` | `b6ddc755f07a10165b2365a7307001e5fadea84d` | `server/test/auth/tokens.spec.ts` | Provenance header and the import path only (COPY) |
| `services/backend-core/apps/api/src/pos-operators/descope-verifier.ts` | `9b68e33aabaa5b8f83a8b47d83790ce7c7a2e9c2` | `server/src/auth/identity/descope-verifier.ts` | ADAPT: returns a verify result instead of throwing, tells outage from refusal by jose error code, requires the audience, one pinned issuer, Kawalys token-age default, `KAWALYS_*` configuration. Refusals now carry an allowlisted reason (jose code plus claim name, never values). Kawalys later added the `drn` allowlist (only `DS`; `token_type` `refresh` refused) and refusal of impersonation tokens (`act` / `dact` claims) |
| `services/backend-core/apps/api/test/pos-operators/descope-verifier.unit.spec.ts` | `9b68e33aabaa5b8f83a8b47d83790ce7c7a2e9c2` | `server/test/auth/descope-verifier.spec.ts` | ADAPT: the donor refusal matrix, re-expressed for the new result type, plus Kawalys-only cases |
| `services/backend-core/apps/api/src/auth/identity-provider.port.ts` | `d720c51de949dfbea0c91625b61c061f6a7434d7` (origin/main when read) | `server/src/auth/identity/identity-verification.port.ts` | REFERENCE: the neutral-port idea only. The shape is BACK-14 section 4 (`VerifiedSubject` with issuer, four result kinds), not RT's |
| `services/backend-core/packages/auth/src/types.ts` | `b6ddc755f07a10165b2365a7307001e5fadea84d` | `server/src/auth/session/session.types.ts` | REFERENCE: the branded `RawToken` / `TokenHash` technique only |
| `services/backend-core/apps/api/src/auth/session.repository.ts` | `d720c51de949dfbea0c91625b61c061f6a7434d7` (origin/main when read) | `server/src/auth/session/session.service.ts` | REFERENCE: absolute cap plus sliding idle window pattern only; no RT code |
| `services/backend-core/apps/api/src/auth/session.repository.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/src/auth/session/postgres-session-store.ts` | Reference only (pattern), no code copied: durable store behind the SessionStore port, hash-only credential, one-way revocation |
| `apps/pos/src/main/http/transport.ts` | `be0c51836fde07f5bee98729b84b6af5a2f934fb` | `server/src/connectors/github/github.transport.ts` | ADAPT (pattern only, no code copied): an injectable read transport, with a missing HTTP answer (network, timeout) kept apart from an HTTP status. No implementation ships: there is no network code |
| `integrations/erpnext-connector/retail_tower_erpnext_connector/provisioner/feed_client.py` (`_failure`) | `be0c51836fde07f5bee98729b84b6af5a2f934fb` | `server/src/connectors/github/github.observer.ts` (`classify`) | ADAPT (pattern only, no code copied): 401/403 refused, 5xx and network unavailable. Kawalys adds 404 as not visible, 429 and an exhausted 403 rate limit, and maps each to an evidence state that is never `ok`. Retail Tower has no GitHub client, so the GitHub mapping is a BUILD |

Source repository: Kemetra-Labs/Retail-Tower-Erp. The database donor files (pinned `dea1adc`) were verified unchanged at donor HEAD `3c60dc0`. The authentication files follow BACK-14 Matrix v2: I5 adapted, tokens copied, I1, I8 and the session pattern referenced; I3, I4, I6, I7 and I9 not reused (see `docs/planning/BACK-14/README.md`).

## Licence

Apache-2.0, Copyright 2026 Kemetra-Labs. See the donor files at the pinned SHA:

- [LICENSE](https://github.com/Kemetra-Labs/Retail-Tower-Erp/blob/dea1adc386ad6e8129e7342c873c74ea6f9e5b0c/LICENSE)
- [services/backend-core/NOTICE](https://github.com/Kemetra-Labs/Retail-Tower-Erp/blob/dea1adc386ad6e8129e7342c873c74ea6f9e5b0c/services/backend-core/NOTICE)

This repository has its own Apache-2.0 `LICENSE` at the root; the root `NOTICE` points here.

## Dependencies

`jose` 5.10.0 (MIT), the same pinned version as the donor. It is the runtime dependency of the authentication foundation (PR #76). `pg` 8.23.1 (MIT) is the runtime dependency of the database foundation; `testcontainers` and `@testcontainers/postgresql` 12.2.1 are dev dependencies for the Docker Postgres tests.

## Independence

No runtime dependency on `@data-pulse-2/*`, no shared credentials, no shared Descope project, Retail Tower unchanged. No Retail Tower `DESCOPE_*` variable is read.

## Rollback

Delete `server/src/errors/envelope.ts` and its test (`server/test/errors/envelope.spec.ts`), the adapted database files (`server/src/db/workspace-context.ts`, `server/test/db/rls-coverage.invariant.spec.ts`, `server/src/audit/audit-row.writer.ts`, and the audit trigger section of `server/migrations/0001_foundation.sql`), `server/src/auth/session/postgres-session-store.ts`, this `THIRD_PARTY.md` file, and the Retail Tower paragraph in the root `NOTICE`. To remove the authentication foundation, see "Rollback" in `server/README.md`.
