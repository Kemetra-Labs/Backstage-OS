# Kawalys pilot deployment runbook (BACK-64)

Status: **runbook. Nothing here was run against a real host.** The stack was proven only on one developer machine, with Docker, by `deploy/pilot/smoke.sh`. No VM, DNS name, public certificate, Descope project or secret exists.

Who does each step: **owner** (decides, owns accounts and secrets) or **operator** (runs commands on the host; may be the owner). Steps marked `[local, verified]` were run on a developer machine through the smoke. Steps marked `[NOT RUN]` need a real host, DNS or Descope and were never run. Commands with no mark were not run at all.

## 0. What this deploys, and the blocking gap

Four Compose services in `deploy/pilot/compose.yml` (project `kawalys-pilot`):

| Service | What it is | Published ports |
| --- | --- | --- |
| `web` | Caddy 2 serving the live-mode app build and proxying `/api/*` to the BFF. Gets a public certificate for `KAWALYS_SITE_ADDRESS`. | 80, 443 (the only ones) |
| `bff` | The Kawalys BFF (`server/`), non-root, all capabilities dropped. | none |
| `postgres` | PostgreSQL 18.7 (`postgres:18.7-alpine`, BACK-113) with TLS on, on the private network. | none |
| `pki` | One-shot: makes a private CA and the Postgres server certificate. | none |

`ops` (profile `ops`) is an operator command container: provision and migrate with the admin login. `up` never starts it.

**Blocking gap for real sign-in.** The lab page `/auth/lab` is refused in production (`KAWALYS_AUTH_LAB` cannot be set with `NODE_ENV=production`). The app has no Descope sign-in of its own yet. Until decision D3 (a), the Descope web SDK inside the app, is built, a deployed pilot cannot sign anyone in. D3 (a) adds a dependency and needs owner approval. So "at least one non-local environment can run the pilot" with real sign-in is **not met**. What this runbook gives you: a stack that starts, answers `/api/health`, and answers deny-all to every protected route.

## 1. Owner: decisions and accounts

Nothing is decided. Options are neutral; the repo's recommendation is labelled.

| Decision | Options | Recommendation |
| --- | --- | --- |
| Host | Any Linux VM with Docker Engine and the Compose plugin, from any provider; ports 80 and 443 reachable from the internet; about 2 vCPU and 4 GB RAM should be enough for one owner (an estimate, not measured). | None. The owner picks. |
| DNS | One name with an A/AAAA record to the VM. Caddy needs it to obtain a certificate. | Required. |
| Postgres | (a) the bundled `postgres` and `pki` services; (b) a managed Postgres (section 11). | Recommendation: (a) for the first pilot. Nothing extra to buy, and it is the path the smoke proves. |
| Descope | A new Kawalys project, separate from Retail Tower's (see `docs/planning/BACK-56/K-ID-1b-lab-runbook.md`, gate B). Gives `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` (identifiers, not secrets). | Needed for real sign-in, which also needs D3 (a). |
| D3 (a) | Approve the Descope web SDK dependency in `app/`. | Approve when the pilot is to be signed into. |

## 2. Operator: prepare the host `[NOT RUN]`

1. Install Docker Engine and the Compose plugin. Open 80 and 443 only. Do not open 5432 or 8787 (they are not published anyway).
2. Create the DNS record and wait until it resolves to the VM.
3. Get the code onto the host: clone the repository and check out the release tag or commit you intend to run. Images build on the host (`kawalys-pilot-bff:local`, `kawalys-pilot-web:local`); there is no registry.
4. If `172.30.42.0/24` collides with a network on the host, choose another range for `KAWALYS_NETWORK_SUBNET` (section 3).

## 3. Operator: write `.env.pilot` `[NOT RUN]`

From the repo root:

```bash
cp deploy/pilot/env.example deploy/pilot/.env.pilot
chmod 600 deploy/pilot/.env.pilot
```

`.env*` is gitignored and excluded from images (`.dockerignore`). Never commit it. Fill in:

- `KAWALYS_SITE_ADDRESS`: the DNS name. Not `localhost` (that is Caddy's internal CA, smoke only).
- `POSTGRES_PASSWORD` and the three role passwords (`KAWALYS_ROLE_PASSWORD_MIGRATOR`, `_APP`, `_AUTH`): four different values, URL-safe characters only (they go into `postgres://` URLs), for example 48 hex characters each.
- `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT`: both or neither. Leave `KAWALYS_NODE_ENV` empty.
- `KAWALYS_NETWORK_SUBNET`: only if it collides. `KAWALYS_TRUST_PROXY` is derived from it in `compose.yml`; do not set it separately. The BFF then trusts `X-Forwarded-For` only from that range, so the sign-in limit counts per client. On Docker Desktop the limiter may see one gateway address for every client (an environment limit; a Linux host is expected to be fine, not proven).

The owner stores the passwords in their own secret manager. Never put them in chat, tickets or the repo.

Every `docker compose` command below uses this helper. `--env-file` is required: Compose takes the file's variables from it, not from the `environment:` blocks.

```bash
dc() { docker compose -p kawalys-pilot -f deploy/pilot/compose.yml --env-file deploy/pilot/.env.pilot "$@"; }
```

## 4. Operator: first install

**Order matters.** The BFF fails its readiness check (`/health` answers 503) until roles and migrations exist. `up` before provision and migrate leaves `bff` unhealthy, and `web` waits on it.

```bash
dc build
dc up -d postgres                                  # runs pki first: private CA and server certificate
dc --profile ops run --rm ops provision --apply    # once: creates the three roles and the schema
dc --profile ops run --rm ops migrate --apply
dc up -d bff web
dc ps
```

- `[local, verified]` by `smoke.sh`: build, pki, postgres, provision, migrate, `up -d`, health, deny-all, hardening, database outage (with a generated env and `localhost`).
- `provision` is **not repeatable**: it uses `CREATE ROLE`, so a second run on the same database fails. Run it **exactly once**. It creates the roles one at a time, so a failure part-way leaves some roles behind and a re-run then fails on the first one. Recovery: on a fresh install with no data, `dc down -v` and start again from `dc build`. Otherwise, as `kawalys_admin` in `psql`, drop the partially created roles (`DROP ROLE kawalys_migrator, kawalys_app, kawalys_auth` as far as they exist, after dropping anything they own) and re-run. Not tested. Without `--apply` the ops commands print a dry run only.
- `NODE_ENV` defaults to production in the image. Production refuses to start without both `KAWALYS_DESCOPE_PROJECT_ID` and `KAWALYS_OWNER_SUBJECT` (fail closed). So until the owner has the Descope project, `bff` will not start on a real host. That is by design; only `smoke.sh` sets development, to prove the rest.
- The web image is built with `npx vite build` and `VITE_KAWALYS_LIVE=1`: the app calls `/api` on its own origin.
- The BFF requires `sslmode=verify-full` for any non-loopback database host. `pki` creates a CA in volume `pki-ca` (mounted only by `pki`) and a Postgres server certificate in volume `pg-tls` (`ca.crt`, `server.crt`, `server.key`). `bff` and `ops` trust it through `NODE_EXTRA_CA_CERTS=/pki/ca.crt`.

## 5. Owner: Descope settings for the deployed origin `[NOT RUN]`

- In the Kawalys Descope project, add the deployed host to Approved Domains, and set the sign-in redirect to the deployed origin once D3 (a) defines the page.
- Do **not** use `https://<name>/api/auth/lab`. The lab route is loopback-only and refused in production; it answers 404.
- No Descope management key or secret is stored on the host.

## 6. Operator: verify `[NOT RUN]` (the same kinds of checks pass locally in `smoke.sh`)

```bash
curl -fsS https://<name>/api/health                                       # 200 when the database and both roles answer
curl -sS -o /dev/null -w '%{http_code}\n' https://<name>/api/portfolio    # 404: deny-all without a session
curl -fsS https://<name>/api/process                                      # liveness only
dc logs --tail 50 bff web
```

- `/api/health` is readiness: 503 means the database is unreachable or not provisioned. It never reports healthy while unknown. `/api/process` is liveness only.
- Deny-all means every protected route answers 404 (the standard not-found envelope). With the Descope variables set but no sign-in page (the gap in section 0), it stays that way.
- In a browser, check the certificate is issued for the DNS name.

## 7. Operator: upgrade `[NOT RUN]`

Take a backup first (section 8).

```bash
git fetch && git checkout <new tag or commit>
dc build
dc --profile ops run --rm ops migrate --apply     # no-op when nothing is pending
dc up -d bff web
```

Then check `/api/health`. Migrations apply forward only.

### 7a. PostgreSQL major version: 17 to 18.7 (BACK-113)

The owner-approved baseline is **PostgreSQL 18.7** (decision 2026-11-27; no PostgreSQL 19). The pilot stack, the local development stack and the server tests all pin `postgres:18.7-alpine`. `smoke.sh` and `server/test/db/pg-version.spec.ts` fail if the running server is not 18.7.

- **Fresh install** (the only case today: nothing is deployed): nothing extra. Section 4 creates an 18.7 cluster. `[local, verified]` through the smoke.
- **Volume layout changed.** The 18 image keeps its data in `/var/lib/postgresql/18/docker`, so `compose.yml` mounts `pg-data` at `/var/lib/postgresql` (it was `/var/lib/postgresql/data` on 17).
- **An existing 17 volume is refused, not silently replaced.** Started under 18.7, the container exits with code 1 and a "pg_upgrade" message instead of creating an empty cluster. `[local, verified]` with a throw-away 17.12 volume.
- **Upgrading a stack that holds 17 data** `[NOT RUN]`: on the old commit (still 17.12), stop every writer first with `dc stop bff web`, leaving `postgres` running. A dump is a snapshot, so any write made after it would be missing from the new database. Then take the final dump (section 8) and keep it off the host. Stop the stack with `dc down` (no `-v`), keep the old `pg-data` volume, and check out the new commit. Start 18.7 on a **new** volume by setting a different Compose project name or renaming the volume in a local override. Run `provision --apply` only, restore the dump (section 8), then run `migrate --apply` and verify (section 6). `pg_upgrade --link` is faster but not prepared or tested here.
- **Rollback**: the old volume was never touched. First bring the 18.7 stack down without `-v`, using the same project name or override it was started with. Otherwise it keeps ports 80 and 443 and the network subnet, and the old stack cannot start. Remove the override or project name, go back to the previous commit (17.12 and the old mount path) and start it on the old volume. Writes made on 18.7 after the cut-over are lost unless they are dumped and restored back, and a dump from 18 is not guaranteed to restore on 17.
- **Local development stack** (`server/docker-compose.local.yml`): the data is disposable. Run `npm run local:down` (it deletes the volume), then `npm run local:up`.

## 8. Operator: backup and restore (not tested, not even locally)

Backup, as the admin role:

```bash
(umask 077; dc exec -T postgres pg_dump -U kawalys_admin -d kawalys -Fc > /path/outside/repo/kawalys-$(date +%F).dump)
```

The `umask 077` makes the file readable by its owner only (the default would usually be world-readable, and the dump holds evidence rows). Store dumps outside the repository checkout, encrypted at rest, and keep a copy off the host. Back up the `pki-ca` volume only if you want to keep the same CA across a rebuild; the archive holds the CA private key, so store it like a secret.

Restore into the freshly provisioned database of a new stack, **before** any `migrate`: run `provision --apply` only, do not run `migrate` (the dump already contains the schema and the migration history, and a prior migrate makes the restore collide):

```bash
dc stop bff web
dc exec -T postgres pg_restore -U kawalys_admin -d kawalys --clean --if-exists < kawalys-<date>.dump
dc up -d bff web
```

After the restore, `migrate --apply` is safe (it applies only what the dump lacks). Try a restore on a scratch host first, before relying on it.

**Warning: `dc down -v` deletes the volumes `pg-data` and `pg-tls` (all database data and the Postgres certificate), and also `pki-ca` and the Caddy volumes. Never use `-v` on a stack whose data you need. `dc down` without `-v` is safe.**

## 9. Operator: rollback `[NOT RUN]`

1. `git checkout <previous tag or commit>`, `dc build`, `dc up -d bff web`. Images are tagged `:local` and rebuilt on the host, so keep the previous commit identified until the new one is proven; there is no earlier image to pull.
2. Migrations are forward only; rolling code back does not undo them. To undo one, restore the pre-upgrade dump (section 8).

## 10. Rotation

The `pki` rotation commands for the certificate and the CA were run locally on a throwaway project and gave a new server certificate (same `ca.crt`) and a new CA plus certificate. Restarting `postgres` and `bff` afterwards, and the password steps, were not run.

- **Role passwords** (owner decides, operator runs): `ops provision` cannot change an existing role. Run `ALTER ROLE <role> PASSWORD '...'` in `psql` as `kawalys_admin` (`dc exec postgres psql -U kawalys_admin -d kawalys`), update `.env.pilot`, then `dc up -d --force-recreate bff`. For `POSTGRES_PASSWORD`, run `ALTER ROLE kawalys_admin PASSWORD '...'` first, then update the file (it is only used by `ops` and the Postgres first start).
- **Postgres server certificate** (operator). It is valid 825 days and is rotated by hand, so note the install date and rotate before it ends. Remove `server.crt` from `pg-tls` and run `pki` again; it reissues from the existing CA:
  ```bash
  dc run --rm --no-deps --entrypoint sh pki -c 'rm -f /pki/server.crt'
  dc run --rm pki
  dc restart postgres bff
  ```
  `ca.crt` does not change, so the BFF trust is unaffected.
- **Full CA rotation** (operator; the CA is valid 10 years, or rotate after a CA key leak). Database data is untouched:
  ```bash
  dc stop bff postgres
  dc rm -f pki                                   # an exited pki container still holds the volume
  docker volume rm kawalys-pilot_pki-ca
  dc run --rm --no-deps --entrypoint sh pki -c 'rm -f /pki/ca.crt /pki/server.crt /pki/server.key'
  dc run --rm pki                                # new CA, new server certificate
  dc up -d postgres
  dc up -d --force-recreate bff
  ```
- **Descope ids** (owner): change `KAWALYS_DESCOPE_PROJECT_ID` or `KAWALYS_OWNER_SUBJECT` in `.env.pilot`, then `dc up -d --force-recreate bff`. The owner binding in the database is fixed at first sign-in; a different owner is refused until an operator moves the binding (`server/README.md`, "Database owner directory").

## 11. Using a managed Postgres instead `[owner decision, not built, NOT RUN]`

For Neon, read `docs/planning/BACK-114/neon-pg18-readiness.md` first. A Neon project cannot change major version, so 18.x needs a new project, and the current 3-second health check would keep Neon's compute from ever suspending (BACK-115). **For Neon, these points override the generic bullets below:**

- The two runtime URLs (`bff`) may use Neon's **pooled** endpoint; BACK-55 proved RLS isolation through it. `KAWALYS_ADMIN_DATABASE_URL` (`ops`) must stay on the **direct** endpoint (`db-admin` refuses `-pooler` hosts).
- Allowlisting the host's address needs Neon IP Allow, which is Scale-only. On Launch there is no allowlist step. Protection rests on `sslmode=verify-full`, strong role passwords and role isolation. That trade-off is the owner's to accept (readiness doc, section 3).
- Provision with `--plaintext-passwords` (Neon refuses pre-hashed ones), then rotate the role passwords.

Remove `pki` and `postgres` from `compose.yml`, with their volumes `pg-data`, `pg-tls` and `pki-ca`, and the `depends_on: postgres` entries. Then:

- Create the database and an admin login at the provider. Point `KAWALYS_ADMIN_DATABASE_URL` (`ops`) and the two runtime URLs (`bff`) at the provider's **direct** endpoint, with `sslmode=verify-full`. In `compose.yml` those URLs are built for host `postgres`, so they must be edited or turned into variables.
- Trust the provider's CA: mount its root certificate and point `NODE_EXTRA_CA_CERTS` at it for `bff` and `ops`. A provider with a public CA may need nothing.
- `provision` and `migrate` run the same way. Allow only the host's address at the provider.
- Backups and rotation of the database and its certificate move to the provider; sections 8 and 10 (database parts) no longer apply.

## 12. Teardown

```bash
dc down          # removes containers; data kept
dc down -v       # DESTROYS pg-data, pg-tls, pki-ca and the Caddy volumes. Back up first.
```

Then the owner removes the DNS record and the VM, and revokes the Descope setup.

## 13. Local proof (operator, any machine with Docker) `[local, verified]`

`bash deploy/pilot/smoke.sh` builds both images and runs pki, postgres, provision, migrate and the stack in development mode. It checks health, deny-all, container hardening, no password or `.env` inside images, the per-client sign-in limit behind Caddy, and a database outage. It uses a generated env file and `localhost`, and ends with `SMOKE RESULT: ALL PASS`.

It is safe to run on a host that already runs the pilot: each run uses its own unique Compose project (`kawalys-pilot-smoke-<random>`), image tags, volumes, network subnet (`KAWALYS_SMOKE_SUBNET`, default `172.31.77.0/24`) and non-default ports (18080/18443), refuses to run under the name `kawalys-pilot`, and its cleanup removes only that project. The deployment's containers, volumes and images are not touched.
