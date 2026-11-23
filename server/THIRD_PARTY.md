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
| `services/backend-core/apps/api/src/auth/identity-provider.port.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/src/auth/identity-provider.port.ts` | Adapted: verification only (no invite/create/reset/link operations), verified email carried for the owner binding, typed IdentityTokenRejected |
| `services/backend-core/apps/api/src/pos-operators/descope-verifier.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/src/auth/descope-verifier.ts` | Adapted: separate Kawalys project, 15-minute token-age cap, no env overrides, email claim extraction |
| `services/backend-core/apps/api/src/auth/session.repository.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/src/auth/session-store.ts` | Adapted: plain pg, no drizzle or cache, no tenant/store context, node:crypto hashing, disabled users refused |

Source repository: Kemetra-Labs/Retail-Tower-Erp. The donor files above were verified unchanged at donor HEAD `3c60dc0`.

## Licence

Apache-2.0, Copyright 2026 Kemetra-Labs. See the donor files at the pinned SHA:

- [LICENSE](https://github.com/Kemetra-Labs/Retail-Tower-Erp/blob/dea1adc386ad6e8129e7342c873c74ea6f9e5b0c/LICENSE)
- [services/backend-core/NOTICE](https://github.com/Kemetra-Labs/Retail-Tower-Erp/blob/dea1adc386ad6e8129e7342c873c74ea6f9e5b0c/services/backend-core/NOTICE)

This repository has its own Apache-2.0 `LICENSE` at the root; the root `NOTICE` points here.

## Independence

No runtime dependency on `@data-pulse-2/*`, no shared credentials, Retail Tower unchanged.

## Rollback

Delete `server/src/errors/envelope.ts` and its test (`server/test/errors/envelope.spec.ts`), the adapted database files (`server/src/db/workspace-context.ts`, `server/test/db/rls-coverage.invariant.spec.ts`, `server/src/audit/audit-row.writer.ts`, and the audit trigger section of `server/migrations/0001_foundation.sql`), the adapted authentication files (`server/src/auth/identity-provider.port.ts`, `server/src/auth/descope-verifier.ts`, `server/src/auth/session-store.ts`), this `THIRD_PARTY.md` file, and the Retail Tower paragraph in the root `NOTICE`.
