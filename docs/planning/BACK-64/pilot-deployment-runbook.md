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

**Real sign-in (D3 (a), option B).** The lab page `/auth/lab` is refused in production (`KAWALYS_AUTH_LAB` cannot be set with `NODE_ENV=production`). The app now has its own `/sign-in` page (live mode only), built on the Descope web component; see section 5a. It has **never been used against a real Descope project**: a real sign-in (P5) has not been run, so "at least one non-local environment can run the pilot" with real sign-in is **not yet shown**. What this runbook gives you: a stack that starts, answers `/api/health`, and answers deny-all to every protected route until the owner signs in.

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

- In the Kawalys Descope project console, set the **App URL** and add **Approved Domains** = `kawalys.kemetralabs.com` (the deployed host). The Descope connector cannot set these; the owner does.
- Do **not** use `https://<name>/api/auth/lab`. The lab route is loopback-only and refused in production; it answers 404.
- No Descope management key or secret is stored on the host.

## 5a. Sign-in (D3 (a), option B) `[NOT RUN]`

- **How it works.** The owner opens `https://<name>/sign-in`, enters the email, and follows the Descope **magic link**, which returns to `/sign-in?t=...`. The page makes one exchange (`POST /api/auth/session`, the Descope JWT in the `Authorization` header only), then calls the SDK logout and removes Descope's persisted storage keys. The Kawalys session cookie is the only session; each sign-in needs a fresh magic link.
- **Build.** The web image reads the Descope project id at build time (`VITE_KAWALYS_DESCOPE_PROJECT_ID`, a public identifier, set as a literal in `.github/workflows/images.yml`). A build without it still works; the sign-in page then shows "not configured". The id must equal `KAWALYS_DESCOPE_PROJECT_ID` on the BFF.
- **Edge headers.** `/sign-in` gets `Cache-Control: no-store`, `Referrer-Policy: no-referrer` (the magic-link token is in the URL) and a `Content-Security-Policy-Report-Only` header that allows the Descope hosts. Every other path gets a stricter report-only policy with no Descope host. The source of each non-`'self'` origin is in the comments of `deploy/pilot/Caddyfile`.
- **The CSP is report-only.** Nothing is blocked yet. Read the reports in the browser console on the pilot (DevTools, Console, "Content Security Policy" lines) during the first real sign-in. No report endpoint exists; the console is the only place they appear. If the first real sign-in shows no violations, switch both headers to enforcing (`Content-Security-Policy`) in a follow-up change (auth review F-001). Descope may also load things that depend on the project's own settings (a Google font, device fingerprinting, telemetry); a violation for such a host means the policy needs that host before it is enforced.
- **Before reading CSP reports,** switch off Cloudflare Rocket Loader, Email Obfuscation and Web Analytics auto-injection for `kawalys.kemetralabs.com`: they inject inline scripts that would show as report-only violations unrelated to Descope.
- **After the first real sign-in, the owner verifies in the browser:** DevTools, Application, **Local Storage** and **Session Storage** for the pilot origin hold no Descope credential keys (`DS` session JWT, `DSR` refresh JWT, `DSI`, `DSRCN`, `DTD`, `DKD`, `DSLI`, `dls_last_user_*`). The code removes exactly those; it deliberately leaves non-credential Descope state (`fp`, `vsid`, `vrid`, flow nonces, `dls_ab_testing_id`), so those may still be there. The removal was proven only in unit tests, not in a real browser against Descope.
- **Open items.** The transitive dependency `@fingerprintjs/fingerprintjs-pro@3.11.6` (pulled in by the Descope SDK) has a proprietary licence ("SEE LICENSE IN LICENSE"): accepted by the owner 2026-11-27 as Descope's responsibility (transitive dependency of @descope/web-component). **Not run:** a real Descope sign-in (P5), any browser check against the deployed origin, the CSP in enforcing mode.

## 6. Operator: verify `[NOT RUN]` (the same kinds of checks pass locally in `smoke.sh`)

```bash
curl -fsS https://<name>/api/health                                       # 200 when the database and both roles answer
curl -sS -o /dev/null -w '%{http_code}\n' https://<name>/api/portfolio    # 404: deny-all without a session
curl -fsS https://<name>/api/process                                      # liveness only
dc logs --tail 50 bff web
```

- `/api/health` is readiness: 503 means the database is unreachable or not provisioned. It never reports healthy while unknown. `/api/process` is liveness only.
- Deny-all means every protected route answers 404 (the standard not-found envelope). With the Descope variables set it stays that way until the owner has signed in through `/sign-in` (section 5a).
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

## 11. Managed Postgres (Neon) profile `[built and measured locally (BACK-115); NOT RUN on a host]`

The managed database exists: Neon project `kawalys-pg18`, PostgreSQL 18.7, Frankfurt, provisioned, migrated and verified (BACK-114, `docs/planning/BACK-114/neon-pg18-readiness.md`, section 9). Use `deploy/pilot/compose.managed.yml` instead of `compose.yml`: it runs `web`, `bff` and the on-demand `ops` only. There is no `postgres`, `pki` or database volume, and only `web` publishes ports (80/443). In the commands below, `dcm` means `docker compose -p kawalys-pilot -f deploy/pilot/compose.managed.yml --env-file /path/to/.env.pilot`.

**Env file.** Start from `deploy/pilot/env.managed.example`.
- `KAWALYS_DATABASE_URL_APP` and `KAWALYS_DATABASE_URL_AUTH`: the whole URLs, with `sslmode=verify-full&channel_binding=require`. Neon's **pooled** host is fine here; BACK-55 and BACK-114 proved RLS isolation through it.
- The BFF refuses any non-loopback URL without `verify-full`. Neon's certificate chains to public roots, so no extra CA is needed. A provider with a private CA needs an override file that mounts its CA and sets `NODE_EXTRA_CA_CERTS`.
- Copy the passwords from the Neon console (they are stored there), never from chat or the repo.

**Build first.** Run `dcm build` before any `ops` command. `ops` runs the BFF's `:local` image and has no build of its own, so without a build it fails on a fresh host, or migrates with the previous release's files on an upgrade.

**Provision and migrate** (only when the schema changes; `kawalys-pg18` is already done):
- Add `KAWALYS_ADMIN_DATABASE_URL` (Neon's **direct** host; `db-admin` refuses `-pooler`) and the three `KAWALYS_ROLE_PASSWORD_*` to the env file.
- Run `dcm --profile ops run --rm ops migrate --apply`. A brand-new project also needs `provision --apply --plaintext-passwords` first; Neon refuses pre-hashed passwords.
- Then **remove those four lines** from the env file. The running stack must not hold the owner-level credential; `bff` and `web` start without them.

**Deploy:** `dcm build` (if not already done above), then `dcm up -d bff web`.

**Readiness gate (required before calling a deploy or upgrade done):**

```bash
ready=no
for i in $(seq 1 10); do
  curl -fsS --max-time 5 https://<site>/api/health | grep -q '"ready":true' && { ready=yes; break; }
  sleep 3
done
[ "$ready" = yes ] || { echo "NOT READY: roll back"; false; }
```

It exits non-zero unless an answer is 200 with `"ready":true`, so a deploy script can rely on it. Retry because a sleeping Neon compute wakes on the first query (measured below). A first answer of 503 right after a wake is expected; ten 503s are not. If it never turns ready, roll back (section 9).

**Liveness versus readiness.**
- The `bff` container healthcheck polls `/process` every 3 s. That is process liveness and never touches the database (BACK-115). So `docker compose ps` showing `healthy` means the process is up, **not** that the database is reachable. Readiness is `/api/health` only.
- Database pools close idle connections after 10 s, so nothing holds the compute awake between requests.

**Measured** (27 Nov 2026, the BFF built from this branch run locally against `kawalys-pg18` over the pooled host, verify-full):

| Measurement | Result |
| --- | --- |
| BFF boot, including waking the compute and the role checks | 4.4 s |
| `/health`, warm | about 70 ms |
| Idle: only `/process` polled every 3 s for 5.5 min | 107 of 107 polls OK; the compute **suspended** 5 min 13 s after the last query (Neon's 300 s timeout) |
| First `/health` after the suspend (wake-up) | 1.78 s, `ready:true`; then about 70 ms |

The wake-up is close to the readiness probe's 2 s bound. A slower wake gives one 503, which is why the gate retries. **Cost:** with idle suspend working, compute is billed only while the pilot is used. That is the readiness doc's scale-to-zero case (about $4 a month), not the always-on case (about $20).

**Backup and restore.** Neon keeps 7 days of history; point-in-time restore was drilled in BACK-114. To restore: create a branch from `main` at a timestamp before the incident, check it with SQL, then point **both** runtime URLs at that branch's own endpoint host and recreate the BFF (`dcm up -d bff`), then run the readiness gate and check the restored data. Making the branch the default in Neon does not change the endpoint host already in the env file: without updating the URLs the BFF keeps using the old branch, and readiness would pass against it. `pg_dump` over the direct host (section 8 commands, with the managed URL) remains a portable extra copy.

**Rotation.**
- Reset a role's password in the Neon console or API. Update the matching URL in the env file, then `dcm up -d bff`. The old password stops working at once, so expect a few seconds of 503 on `/api/health`.
- Rotate after anyone has seen a password.

**Rollback.** Code: section 9 with `dcm`. Database: migrations are forward only; restore a branch as above.

**Network.** IP Allow (an allowlist of host addresses) is a Neon Scale feature. On Launch there is no allowlist; protection is TLS verify-full, strong role passwords and role isolation (readiness doc, section 3).

### Origin certificate (Cloudflare Origin CA) `[proven on the pilot host 2026-11-27]`

**Run record (27 Nov 2026):** the certificate for `kawalys.kemetralabs.com` was issued by Cloudflare (id `369951370120849616063248932064496707687717040930`, 1095 days) for a CSR whose key was created on the host and never left it. **It expires 2029-11-26 and nothing renews it: keep a calendar reminder and rotate before then (see Rotation).** On the host: the certificate matched the key, Caddy (uid 10001, read-only root filesystem) read it, the served issuer was `CloudFlare Origin SSL Certificate Authority`, and Caddy logged `skipping automatic certificate management`. Through Cloudflare `/api/health` returned `ready:true` with a verified certificate and a protected route returned 404.

**Rollback floor for `web`:** release 1 `web` has no `import /etc/caddy/tls.d/*`. Putting it back keeps the mount but silently returns Caddy to automatic Let's Encrypt (the renewal risk this section removes). `web` never goes below release 2; the BFF can (see "Release rollback" below).

**Always use all three `-f` files** (`compose.managed.yml`, `compose.deploy.yml`, `compose.origin-cert.yml`) for every `up`, `ps`, `logs` and `pull` on the host. Using only the first two recreates `web` without the certificate mount and switches back to automatic certificates.

Optional, off by default. By default Caddy obtains and renews its own Let's Encrypt certificate, which needs Let's Encrypt to reach the origin through Cloudflare. With an Origin CA certificate (valid only between Cloudflare and the origin) Caddy serves mounted files and never contacts an ACME CA. The override is `deploy/pilot/compose.origin-cert.yml`; the Caddyfile imports `/etc/caddy/tls.d/*`, which is empty (a no-op) unless the override mounts `tls-origin.caddy` there.

**Prerequisites (all three, before step 6):**
- The DNS record is **proxied** (orange cloud) and Cloudflare SSL is **Full (strict)** for this host. Origin CA certificates are not trusted by browsers, so with a DNS-only record a browser, and the readiness `curl`, would connect straight to the origin and reject the certificate.
- The `web` image in `.env.pilot` (`KAWALYS_WEB_IMAGE`) is a release **built after** the `import /etc/caddy/tls.d/*` line was added to the Caddyfile. An older digest mounts the certificate but keeps automatic HTTPS. Run the Images workflow and set the new digest first.
- The checkout is at the commit that contains `compose.origin-cert.yml`.

1. Create the directory outside the git checkout, **with absolute paths only** so your working directory stays in the checkout: `sudo mkdir -p /opt/kawalys/tls`.
2. Generate the key and the CSR **on the host**. The key never leaves it: `sudo openssl req -new -newkey rsa:2048 -nodes -keyout /opt/kawalys/tls/origin.key -out /opt/kawalys/tls/origin.csr -subj "/CN=<site>"`.
3. Obtain the certificate from Cloudflare for that CSR: dashboard SSL/TLS > Origin Server > Create Certificate > "use my own private key and CSR" (paste `origin.csr`; list `<site>` as the hostname), or the API. Save the returned certificate as `/opt/kawalys/tls/origin.pem`. Never paste `origin.key` anywhere.
4. Set ownership and modes (uid 10001 is the Caddy user in the web image): `sudo chown 10001:10001 /opt/kawalys/tls/origin.pem /opt/kawalys/tls/origin.key && sudo chmod 0400 /opt/kawalys/tls/origin.key && sudo chmod 0444 /opt/kawalys/tls/origin.pem`.
5. Add `KAWALYS_ORIGIN_CERT_DIR=/opt/kawalys/tls` to `.env.pilot` (see `env.managed.example`).
6. From the checkout (`cd /opt/kawalys/repo`), deploy with three compose files: `docker compose -p kawalys-pilot -f deploy/pilot/compose.managed.yml -f deploy/pilot/compose.deploy.yml -f deploy/pilot/compose.origin-cert.yml --env-file /opt/kawalys/.env.pilot up -d bff web`. Use the same three `-f` flags for every later `up`, `ps` and `logs`; dropping the third one switches Caddy back to automatic certificates.
7. Verify on the host: `openssl s_client -connect 127.0.0.1:443 -servername <site> </dev/null 2>/dev/null | openssl x509 -noout -issuer -enddate`. The issuer must be Cloudflare Origin CA (not Let's Encrypt, not Caddy Local Authority). Then run the readiness gate above.

Put the certificate's expiry date (the `enddate` printed above) in a calendar reminder: nothing renews it.

#### Release rollback (digest-pinned images) `[BFF drilled 2026-11-27]`

1. Copy the env file first: `sudo cp -p /opt/kawalys/.env.pilot /opt/kawalys/.env.pilot.bak-<UTC timestamp>`.
2. Change only the image variable of the service to roll (`KAWALYS_BFF_IMAGE` or `KAWALYS_WEB_IMAGE`) to the previous `@sha256:` digest, run `bash deploy/pilot/preflight-deploy.sh /opt/kawalys/.env.pilot`, then `up -d <service>` with the **three** `-f` files.
3. Wait for `/api/health` `ready:true` (the readiness gate). To undo, copy the backup over `.env.pilot` and `up -d` again.
4. Per service, the lowest allowed release: **bff** release 1 (`…@sha256:2aa5d074…`), **web** release 2 (`…@sha256:8e131351…`, see above). The migrations are forward only; rolling code back does not undo them.

**Rotation (never overwrite the live pair):** create a new directory (for example `/opt/kawalys/tls-2`) and generate the new key and CSR there (steps 2 to 4 with that path). Check that the certificate and key match and the certificate is valid for `<site>` (`openssl x509 -noout -pubkey -in origin.pem | sha256sum` equals `openssl pkey -pubout -in origin.key | sha256sum`). Then change `KAWALYS_ORIGIN_CERT_DIR` in `.env.pilot` to the new directory, run step 6, and run the readiness gate. Keep the old directory until the new pair has served traffic; to roll back, point the variable at the old directory and run step 6 again.

## 12. Teardown

```bash
dc down          # removes containers; data kept
dc down -v       # DESTROYS pg-data, pg-tls, pki-ca and the Caddy volumes. Back up first.
```

Then the owner removes the DNS record and the VM, and revokes the Descope setup.

## 13. Local proof (operator, any machine with Docker) `[local, verified]`

`bash deploy/pilot/smoke.sh` builds both images and runs pki, postgres, provision, migrate and the stack in development mode. It checks health, deny-all, container hardening, no password or `.env` inside images, the per-client sign-in limit behind Caddy, the `/sign-in` edge headers (no-store, report-only CSP), the build-time Descope project id, `KAWALYS_TRUSTED_PROXIES` reaching Caddy, and a database outage. It uses a generated env file and `localhost`, and ends with `SMOKE RESULT: ALL PASS`.

It is safe to run on a host that already runs the pilot: each run uses its own unique Compose project (`kawalys-pilot-smoke-<random>`), image tags, volumes, network subnet (`KAWALYS_SMOKE_SUBNET`, default `172.31.77.0/24`) and non-default ports (18080/18443), refuses to run under the name `kawalys-pilot`, and its cleanup removes only that project. The deployment's containers, volumes and images are not touched.
