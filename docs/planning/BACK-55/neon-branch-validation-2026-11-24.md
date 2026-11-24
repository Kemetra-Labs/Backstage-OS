# BACK-55 / BACK-58: Neon branch validation, 24 Nov 2026

Scope: a **throwaway Neon branch** (`validate-back55-throwaway`, parent `main`, project `kawalys`, PG 17.12, Frankfurt). Nothing was run on the default branch `main`. No secret is recorded here; the branch's three role passwords were generated for this run only and discarded.

## Findings that changed the code

| # | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| 1 | Neon's owner role is **not a superuser** (`CREATEROLE`, `BYPASSRLS`, member of `neon_superuser`). | `SELECT rolsuper ...` on the branch. | none needed |
| 2 | `CREATE SCHEMA kawalys AUTHORIZATION kawalys_migrator` fails for that admin: `must be able to SET ROLE "kawalys_migrator"` (SQLSTATE 42501). | Ran the pre-fix statement, then the fixed sequence. | `provisionDatabase` now runs `GRANT kawalys_migrator TO CURRENT_USER WITH SET TRUE` first. |
| 3 | Neon refuses pre-hashed passwords: `Neon only supports being given plaintext passwords` (HTTP 400, XX000). | `CREATE ROLE ... PASSWORD 'SCRAM-SHA-256$...'`. | `provisionRoles` takes `passwordFormat: 'plaintext'`; CLI flag `--plaintext-passwords`. SCRAM stays the default for other hosts. |
| 4 | The database config accepted any URL, including a remote one without TLS. | code review | non-loopback hosts now require `sslmode=verify-full`. |

## Passed on the branch (real code, `kawalys_app` / `kawalys_auth` logins, `sslmode=verify-full`)

Run on both the **direct** and the **pooled** endpoint: boot role check (`openDatabase`); workspace A sees only its own row; no workspace context returns zero rows; insert for another workspace refused by the RLS `WITH CHECK`; audit `UPDATE` and `DELETE` refused; `kawalys_app` cannot `SET ROLE kawalys_migrator`, create tables, read identity tables or disable RLS; the workspace setting does not leak to the next pooled use.

Migrations `0001` to `0003` applied through `db-admin migrate --apply` as `kawalys_migrator` on the direct endpoint.

Persistence: after an explicit endpoint suspend, a new connection read the earlier rows (1 workspace, 1 audit event). First query after suspend took about 1.4 s (direct) and 2.0 s (pooled). Role-level `search_path` (`pg_catalog, kawalys`) is in force through the pooler.

## Not proven (still open)

- Point-in-time **restore drill** (needs a timestamped branch or snapshot restore; the 7-day window is configuration only).
- The `db-admin provision` command itself on Neon: the same statements were run by hand through the Neon SQL tool as `kawalys_owner`.
- Runtime secret custody and the host (BACK-58): no production role passwords exist yet. `main` on Neon is untouched: no roles, no schema.
- The Docker-based database test suites were not run in this environment (no Docker); they run in CI.
