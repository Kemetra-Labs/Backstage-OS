# BACK-114 (DEP-02): Neon PostgreSQL 18 readiness, 27 Nov 2026

Status: **owner ruled option A and approved execution on 27 Nov 2026; see section 9.** Sections 1 to 8 are the readiness analysis as written before the ruling. There is no Neon access from the agent's environment: no API key, no `neonctl`, no Neon connector. Facts about the existing project come from the BACK-55 run on 24 Nov (`docs/planning/BACK-55/neon-branch-validation-2026-11-24.md`) and must be rechecked by the owner (section 5). Facts about Neon come from its public docs and pricing page, read on 27 Nov 2026 (links in section 8). No secret appears here.

## 1. Stop condition: the ticket's upgrade cannot be done as written

BACK-114 asks to upgrade the **existing** project `kawalys` (PostgreSQL 17) to 18.7, keep the project and its data, and not take a delete-and-recreate shortcut. Neon does not support that:

- Each Neon project is locked to the major version chosen when it was created. Neon does not upgrade a project to a new major version in place, and it does not support `pg_upgrade`.
- Neon's supported path to a new major version is a **new project** at that version, followed by moving the data (Import Data Assistant, `pg_dump`/`pg_restore` over the unpooled endpoint, or logical replication).

So the acceptance criterion "existing Neon project upgraded to approved version" cannot be met. Following the ticket's Stop rule, this slice returns options (section 3) for an owner ruling instead of building an upgrade plan.

## 2. What is known

| Item | Value | Source |
| --- | --- | --- |
| Existing project | `kawalys`, Frankfurt (`aws-eu-central-1`), Launch plan, PostgreSQL 17.12 | BACK-55 run, 24 Nov. **Recheck (section 5).** |
| Existing data | `main` had no Kawalys roles and no schema. One throw-away branch `validate-back55-throwaway` held test rows. | BACK-55 run. **Recheck.** |
| PostgreSQL 18 on Neon | Generally available. 18 is the default for new projects. 19 is also offered. | Version-support page, updated 20 Nov 2026. An older Neon page still calls 18 "preview"; the version-support page is newer and is taken as authoritative. |
| 18.7 on Neon | Released by PostgreSQL on 12 Nov 2026; available on Neon the same day. | Version-support page. |
| Minor versions | Applied automatically at the next compute restart (including wake from suspend). Only the latest minor of each major is offered. No pinning, no skipping, no downgrade. | Version-support page. |
| Kawalys code on a Neon-like owner | Provision, migrate and the boot role checks pass on **18.7** with a non-superuser admin (`LOGIN CREATEROLE BYPASSRLS NOSUPERUSER`, owns the database, plaintext passwords). | New `server/test/db/managed-admin.spec.ts` (disposable local container). Previously proven only by hand on a Neon PG17 branch. |

**Version deviation the owner must accept:** on Neon, "18.7" is true only until PostgreSQL ships 18.8. Neon will then move the compute to 18.8 at its next restart. The repo pins exactly 18.7 for local and test runs (BACK-113), so the pins must follow each Neon minor release. Production on Neon cannot be held at 18.7.

## 3. Options (owner decides)

| | Option | What it means | Data and rollback | Cost (section 4) |
| --- | --- | --- | --- | --- |
| **A** | **New Neon project on PostgreSQL 18 (Frankfurt, Launch), old `kawalys` kept untouched** | Create `kawalys-pg18` explicitly on 18 (not 19). Provision with `db-admin provision --apply --plaintext-passwords`, then `migrate --apply`, then rotate the three role passwords. | If `main` is still empty (recheck), there is nothing to move. The old project is **preserved, not a ready fallback**: it has no Kawalys roles or schema, so switching back means provisioning it with the same commands. That is cheap only while there is no pilot data. Once the 18 project takes writes, those writes exist nowhere else, and recovery is Neon's restore history on the new project. Retiring the old project is a separate, later owner decision; this slice deletes nothing. | One more project; no per-project fee on Launch. |
| **B** | Stay on Neon PostgreSQL 17 (existing project) | Use `kawalys` as it is. | No move now. Any later major upgrade needs the same new-project move as A, but with pilot data in it. | Same as today. |
| **C** | Bundled PostgreSQL 18.7 on the app host (`deploy/pilot` as it is) | No managed database. Proven by `smoke.sh`. | Backups, restore drills and upgrades are the operator's job (runbook sections 7a and 8). The ticket's goal was to avoid this. | No Neon cost; uses host disk and memory. |

**Recommendation (labelled, not a decision):** A, provided the recheck shows `main` is still empty. It is the only option that gives 18.x on Neon. While the database is empty it costs one extra project and no data move, and nothing is deleted. B leaves a 17-versus-18 gap between production and every test run. C runs against the ticket's goal.

Open plan question for A or B: **IP Allow (a network allowlist) is a Scale-plan feature.** On Launch, anyone who has a connection string and password can reach the endpoint. Protection then rests on TLS `verify-full` (enforced by the BFF for remote hosts), strong random role passwords, role isolation and forced RLS. Scale adds IP Allow and Private Networking at about twice the compute price. Recommendation: Launch for the first pilot with one owner, and revisit before any customer data.

## 4. Cost estimate (Launch plan; rates read 27 Nov 2026)

Rates: compute **$0.106 per CU-hour**, storage **$0.35 per GB-month**, no monthly minimum, no per-project fee, up to 7 days of restore history.

| Case | Assumption | Compute | Storage (1 GB) | About |
| --- | --- | --- | --- | --- |
| Always on | 0.25 CU × 730 h | 182.5 CU-h = $19.35 | $0.35 | **$20 / month** |
| Scale to zero | 0.25 CU, awake about 4 h a day (30 days) | 30 CU-h = $3.18 | $0.35 | **$4 / month** |
| Old project idle (option A) | suspended, a few hundred MB | ~0 | under $0.35 | **< $1 / month** |

Not included: restore-history storage, data transfer, and any growth. These are estimates from public list prices, not a quote.

**The current health check would force the always-on case.** The `bff` container's Docker health check calls `/health` every 3 seconds (`deploy/pilot/compose.yml`), and `/health` queries the database each time (2 s single-flight cache). Against Neon, the compute would never reach its 5-minute suspend. Making health checks idle-safe is BACK-115 (DEP-03), which this ticket blocks. Until it lands, budget for the always-on case.

## 5. Owner recheck in the Neon console (read only, before any decision)

Read, do not change:

1. Project `kawalys`: PostgreSQL version, region, plan.
2. Branches: is `validate-back55-throwaway` still there? Any other branch?
3. Branch `main`: any roles besides Neon's own, any schema besides `public`, any rows? (Expected: none.)
4. Billing: current plan, credits and their expiry, this month's usage.
5. Compute settings on `main`: minimum and maximum CU, suspend timeout.

Do not paste connection strings or passwords into Jira or the repo.

## 6. Proposed settings (for option A; also apply to B)

| Setting | Proposal | Why |
| --- | --- | --- |
| Region | `aws-eu-central-1` (Frankfurt) | Same as the existing project. |
| Postgres version | 18, chosen explicitly at creation | The default is 18 today, but 19 is offered too. |
| Compute | min 0.25 CU, max 1 CU autoscaling | Enough for one owner; caps the spend. |
| Suspend | 5 minutes (Launch default) | Only effective once health checks are idle-safe (BACK-115). |
| Runtime logins (`kawalys_app`, `kawalys_auth`) | Pooled endpoint, `sslmode=verify-full` | BACK-55 proved RLS isolation and no workspace leak through the pooler. Neon's certificate chains to public roots, so `NODE_EXTRA_CA_CERTS` should not be needed (verify at execution). |
| Admin and migrations | Direct (unpooled) endpoint only | Enforced by `db-admin` (it refuses `-pooler` hosts). The migration lock needs a session. |
| BFF pool sizes | app 10, auth 5 (current code) | Well under Launch limits at 0.25 to 1 CU. |
| Passwords | Generated per role, given as plaintext (Neon refuses hashes), rotated after provisioning | The plaintext form appears in DDL text on the server; rotation removes it from use. |
| Restore drill | Before any pilot data: restore a branch to a timestamp, read a marker row, delete the branch | Still unproven since BACK-55. |

## 7. Execution plan (each step needs its own owner approval)

1. **Owner rules** on option A, B or C and on the plan (Launch or Scale), and amends the BACK-114 acceptance criterion to match. For A: "a new 18.x project replaces the existing one; the old project is kept until retired". For B: "stay on 17, deviation from 18.7 accepted". For C: "no managed database for the pilot; BACK-114 closed as not pursued". Steps 3 to 7 apply to option A only. For B, run steps 4 to 6 on the existing project.
2. Owner recheck (section 5) is recorded in a Jira comment, without secrets.
3. **Approval to create** the new project (option A only). The agent needs either a scoped Neon API key in the agent's environment (never in chat or the repo), or the owner runs the steps.
4. Provision, migrate and rotate on the new project. Confirm `SHOW server_version` reports 18.x and record the actual minor.
5. Run the BACK-55 isolation checks against the new project on both endpoints, then the restore drill.
6. Only then point the pilot (`deploy/pilot`, BACK-115 profile) at it.
7. Retiring the old project: a separate owner decision, after the pilot runs on the new one.

## 8. Sources (read 27 Nov 2026)

- Neon, Upgrading your Postgres version: https://neon.com/docs/postgresql/postgres-upgrade (updated 20 Nov 2026)
- Neon, Postgres version support: https://neon.com/docs/postgresql/postgres-version-support (updated 20 Nov 2026)
- Neon, IP Allow: https://neon.com/docs/introduction/ip-allow
- Neon, Pricing: https://neon.com/pricing
- BACK-55 Neon validation: `docs/planning/BACK-55/neon-branch-validation-2026-11-24.md`

## 9. Execution record, 27 Nov 2026 (owner: "create new project, delete the old")

Done through the Neon connector and the repo's own `db-admin`. No secret is recorded here.

| Step | Result |
| --- | --- |
| Recheck of the old project `kawalys` | Launch plan, PostgreSQL 17.12, only branch `main`, no Kawalys roles, only the `public` schema, 0 tables. Nothing to move. |
| Create `kawalys-pg18` (`damp-dew-12696657`) | PostgreSQL **18.7** (`server_version_num` 180007), `aws-eu-central-1`, 0.25 to 1 CU, suspend 300 s, 7-day history, maintenance Saturday 04:00 to 05:00. Admin `kawalys_owner` is not a superuser (CREATEROLE, CREATEDB, BYPASSRLS). |
| `db-admin provision --apply --plaintext-passwords` | Roles `kawalys_migrator`, `kawalys_app`, `kawalys_auth` and schema `kawalys` created over the direct endpoint, `sslmode=verify-full`, `channel_binding=require`. |
| `db-admin migrate --apply` | Migrations 0001 to 0006 applied. |
| Isolation checks (scripted, no data written) | **22/22 pass, 11 on the direct endpoint and 11 on the pooled one.** Covered: 18.7 over verify-full TLS; app and auth pass the boot role check; app cannot CREATE TABLE, SET ROLE migrator, read `users` or disable RLS; auth cannot read `workspaces`; zero rows without workspace context; the workspace setting does not outlive the transaction; role `search_path` is `pg_catalog, kawalys`. |
| Password rotation | All four role passwords reset through the Neon API after provisioning. The provisioning-time ones no longer work. Current ones are stored by Neon (console); the local temp file was deleted. Role attributes rechecked: the three Kawalys roles are NOSUPERUSER, NOBYPASSRLS, NOINHERIT, with the pinned `search_path`. |
| Delete old project `kawalys` (`shy-feather-77977151`) | Deleted. Neon can recover it within 7 days (`recover_project`). |

| Restore drill (owner OK, same day) | Two temporary branches restored from `main` at past moments; Neon resolved them to 15:16:41 and 15:18:12 UTC. **Before setup:** no `kawalys` schema, no migration table, 0 tables. **After migrations:** schema present, migrations 0001 to 0006 recorded, 18 tables, `workspaces` with forced RLS. Both branches deleted afterwards (they also carried a 2-hour auto-expiry). Point-in-time restore is proven, not only configured. |

Still open: custody of the runtime URLs for the host (BACK-58); idle-safe health checks before the pilot points at this project (BACK-115). Minor versions will move with Neon (section 2), so the repo pins follow each Neon minor release.
