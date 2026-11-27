# BACK-116 (DEP-04): Lightsail pilot hosting preflight, 27 Nov 2026

Status: **preflight and plan only. Nothing was created, changed or bought on AWS, Cloudflare or Depot.** AWS facts come from read-only API calls (`Get`, `Describe`, `List`) made with the account's root identity. The owner authorized root for these read-only steps on 27 Nov 2026; root is still not to be used for creating or changing anything. Depot facts come from its public docs. No secret appears here.

## 1. What the account shows (read-only, 27 Nov 2026)

| Item | Finding |
| --- | --- |
| Lightsail in Frankfurt | `eu-central-1` is available, with zones a, b and c. No Lightsail instances and no static IPs exist yet. |
| Target bundle | `small_3_0`: **$12/month**, 2 vCPU, 2 GB RAM, 60 GB disk, 3 TB transfer, 1 public IPv4. The IPv6-only variant `small_ipv6_3_0` is $10/month but has no IPv4. The next tier up is `medium_3_0` at $24/month with 4 GB. |
| OS images | Ubuntu 24.04 LTS, Debian 13 and Amazon Linux 2023 are among those offered. |
| Credits | Active. October usage was $36.35 and November so far is $62.85; **both were fully covered by credits** (record type `Credit`). The API does not show the remaining balance or expiry, so the owner reads those in the Billing console. |
| Budget | `kemetra-aws-lab-monthly`: $100 cost budget with actual-spend alerts at 50, 80 and 100. November usage is already about $63, so the 50 alert has fired. The pilot adds about $12 for Lightsail. |
| Systems Manager | Activation tier `standard` in Frankfurt. |
| Identity | The AWS connection used here is the **root** user. Creating resources must wait for a non-root identity or explicit owner approval (BACK-116 Stop). |

## 2. Architecture (proposed, not provisioned)

- **Host:** one Lightsail `small_3_0` instance in Frankfurt, Ubuntu 24.04 LTS, with a static IP (free while attached). It runs **only** `deploy/pilot/compose.managed.yml` (`web` = Caddy + the app build, and `bff`); `ops` runs only when needed. The database is Neon `kawalys-pg18`, the same region, outside the host.
- **CPU architecture:** Lightsail instances are x86_64, so images are built for `linux/amd64`. Confirm with `uname -m` on the host before the first image pull.
- **No builds on the host.** Images are built once in GitHub Actions (section 4), pushed by digest, and pulled on the host. A 2 GB host should not run `docker build` for the Vite app and the BFF.
- **Prerequisite (not built yet):** `compose.managed.yml` still names `:local` images for `web`, `bff` and `ops`. Pulling a digest does not satisfy those names: on a fresh host Compose would try to build or fail, and on an existing host it could start stale images. BACK-117 needs a deploy override that pins all three services by digest, with `ops` on the same digest as `bff`, and a smoke check that the override resolves.
- **Expected headroom (to be measured, BACK-116 criterion):** Caddy plus one Node BFF should fit well within 2 GB. Measure `docker stats` and `free -m` under the pilot's real use. Report any move to `medium_3_0` ($24) before buying it.

## 3. Network, DNS and access

| Topic | Plan |
| --- | --- |
| Lightsail firewall | Public: 80 and 443 only. With Cloudflare in front, restrict 80/443 to Cloudflare's published IP ranges. Port 22 is not open to the internet (see admin access). No database or BFF port exists on the host (the managed profile publishes none). |
| DNS and TLS | Cloudflare DNS with a proxied record to the static IP, SSL mode **Full (strict)**. Caddy keeps its own valid origin certificate (Let's Encrypt through the HTTP challenge, which Cloudflare passes through), or a Cloudflare origin certificate mounted into Caddy. Pick one at setup; Full (strict) either way. |
| **Client address behind Cloudflare (finding)** | Caddy overwrites `X-Forwarded-For` with the address it sees (`deploy/pilot/Caddyfile`). Behind Cloudflare that is a Cloudflare edge address, so the BFF's per-client sign-in limit would count per Cloudflare edge, not per client. Fix before go-live (BACK-117): Caddy trusts Cloudflare's ranges only (`trusted_proxies`) and forwards `CF-Connecting-IP`. This is a small config change with a test; no code exists for it yet. |
| Admin access | **Recommended:** Lightsail browser-based SSH, with port 22 allowed only for Lightsail's browser connection. Access is through the AWS console, and its key retrieval (`GetInstanceAccessDetails`) is logged in CloudTrail. No long-lived SSH key leaves AWS. **Alternative:** register the instance with Systems Manager through a hybrid activation and use Session Manager. Session Manager on hybrid nodes needs the advanced-instances tier (about $5/month per node), and re-registration problems on Ubuntu 24.04 have been reported. EC2 instance profiles do not apply to Lightsail. |
| Outbound | Lightsail allows all outbound by default. The host needs Neon (5432, TLS), the registry (443), Descope JWKS (443) and OS updates. |
| Descope | The redirect and origin entries must use the final `https://<site>` name; register them in Descope when the name is known (P5). No auth change here. |

## 4. Images: build, registry and pull

**Recommendation (labelled, owner decides):** build in GitHub Actions and push to **GHCR** (`ghcr.io/kemetra-labs/...`), always tagged and pulled by **digest** (`@sha256:...`), never `latest`.

| Option | For | Against |
| --- | --- | --- |
| **GHCR** (recommended) | Already GitHub; pushed with the workflow's own `GITHUB_TOKEN` (`packages: write`), so no new secret in CI. For a private package the host must pull with a **classic** personal access token with `read:packages` only, from an account with read access to the package; GitHub Packages does not accept fine-grained tokens for this. Confirm the organization allows that token before choosing GHCR. If the images can be public (they hold no secrets), the host needs no token at all. | Private package storage counts against the org's GitHub Packages quota. |
| Amazon ECR | Same cloud as the host. | Needs an IAM user with long-lived keys on the Lightsail host (no instance profile on Lightsail), plus ECR storage cost. More moving parts for one host. |
| Depot Registry | Built into Depot builds. | Would make the host depend on Depot for pulls; the ticket says not to make it mandatory. |

**Depot Container Builds** (separate from the Depot *runners* already used for CI, PR #121), per Depot's docs:
- Remote BuildKit with a persistent layer cache: 7/14/30-day retention, 25–1000 GB (default 50 GB).
- Native amd64 and arm64, no emulation.
- `depot/build-push-action` with GitHub OIDC, so no static token.
- Can push straight to GHCR or ECR.
- Billed per build second: the Developer plan includes 500 build minutes and 25 GB cache, then $0.04 per minute.
- Depot **does not host or deploy** applications; it only builds.

**Benchmark proposal (needs owner approval before it runs):**
- **Method:** build `deploy/pilot/server.Dockerfile` and `web.Dockerfile` at one fixed commit, `linux/amd64`, cold and then warm, three ways:
  1. standard Docker Buildx on `ubuntu-latest`
  2. Buildx on the existing Depot runner
  3. `depot/build-push-action`
- **Measure:** time, cache hits, image size and minutes used.
- **Limits:** cap at **60 Depot build minutes** (about $2.40 if outside the plan). Push only to a throw-away GHCR tag, deleted afterwards.
- **Not touched:** no workflow on `main` changes, and no runtime secret ever goes to a build job.

**Supply chain (existing tooling first):** Buildx can attach provenance and an SBOM (`--provenance`, `--sbom`). Scan the image in CI before push. The host deploy names the exact digest that CI tested.

## 5. Secrets on the host (BACK-58 input)

- The runtime needs only `KAWALYS_DATABASE_URL_APP` and `KAWALYS_DATABASE_URL_AUTH`, plus the Descope identifiers, which are not secrets. Migrations need **four** operator-only values: `KAWALYS_ADMIN_DATABASE_URL` and the three `KAWALYS_ROLE_PASSWORD_*`, since `db-admin` refuses to start without all of them. Add them only while running `ops`, then remove all four (runbook section 11, provision and migrate).
- **Simplest option:** `.env.pilot` owned by the deploy user, mode `0600`, outside the repository checkout, and never in an image.
- **Stronger option:** AWS SSM Parameter Store `SecureString`, fetched at deploy. On Lightsail this needs either a hybrid activation or an IAM user's keys on the host, which defeats much of the point for one host.
- **Recommendation:** start with the `0600` file plus the rotation procedure in runbook section 11. Revisit before any customer data.

## 6. Cost (monthly, list prices; currently covered by credits)

| Item | About |
| --- | --- |
| Lightsail `small_3_0` (including static IP and 3 TB transfer) | $12 |
| Neon `kawalys-pg18` (scale to zero working, BACK-115) | $4 (up to about $20 if always awake) |
| Lightsail snapshots, if kept: one weekly, 60 GB | about $3 ($0.05 per GB-month) |
| GHCR | within the org quota (check) |
| Depot | within the current plan if used; benchmark cap $2.40 |
| **Total** | **about $16–19** (about $35 at worst) |

## 7. Backup and teardown

- **Host:** the host holds no data; the database is Neon with 7-day point-in-time restore, drilled in BACK-114. A host rebuild is: create the instance, install Docker, write `.env.pilot`, pull by digest, `up`, readiness gate. An optional weekly Lightsail snapshot speeds up a rebuild but is not a backup of data. A snapshot also captures `.env.pilot` and Caddy's TLS keys, so treat any snapshot as a secret-bearing artifact: restricted access, short retention. The default is no snapshots, and rebuilding from pinned images.
- **Teardown:** detach and release the static IP (an unattached IP is billed), delete the instance and snapshots, remove the Cloudflare record, revoke the GHCR read token.

## 8. Owner approvals needed (each separately)

1. Region and bundle: Frankfurt, `small_3_0`, $12/month. Confirm the credits cover it and note their expiry.
2. The DNS name, and Cloudflare as the DNS and proxy.
3. Operator access: Lightsail browser SSH (recommended) or SSM hybrid (about $5/month).
4. Resource creation: an instance, a static IP, firewall rules and a budget alert for the pilot. Done by a non-root identity, or by root only with explicit approval for those exact steps.
5. Registry: GHCR (recommended), and approval to run the Depot benchmark (cap 60 minutes).
6. BACK-58: the `0600` env file for the pilot.

After approval, the execution goes to BACK-117 (the actual rollout). BACK-116's own remaining criterion is the measured headroom on the real host.

## 9. Sources (read 27 Nov 2026)

- AWS APIs (read-only): `lightsail:GetBundles`, `GetBlueprints`, `GetRegions`, `GetInstances`, `GetStaticIps`; `budgets:DescribeBudgets`, `DescribeNotificationsForBudget`; `ce:GetCostAndUsage` grouped by record type; `ssm:GetServiceSetting`.
- Depot, Container Builds overview: https://depot.dev/docs/container-builds/overview
- AWS re:Post, How do I add a Lightsail instance to Systems Manager?: https://repost.aws/knowledge-center/add-lightsail-to-systems-manager

## 10. Created resources, 27 Nov 2026 (owner: "Yes, create it")

Created by the agent with the root identity, under the owner's explicit approval for these steps. Nothing else was created.

| Resource | Value |
| --- | --- |
| Instance | `kawalys-pilot`, `small_3_0` ($12/month), Ubuntu 24.04 LTS, `eu-central-1a`, dual-stack. Tags: `project=kawalys`, `ticket=BACK-116`, `purpose=pilot`. |
| Static IP | `kawalys-pilot-ip`, attached: **63.189.76.76**. IPv6 is assigned by Lightsail. |
| Firewall | 22/tcp only from `lightsail-connect` (Lightsail browser SSH); 80/tcp and 443/tcp open, IPv4 and IPv6. Restrict 80/443 to Cloudflare's ranges once the DNS record is proxied. |
| First-boot setup | Ubuntu packages only: `docker.io`, `docker-compose-v2`, `unattended-upgrades`; Docker enabled; the `ubuntu` user added to the `docker` group. It writes `/var/log/kawalys-bootstrap.log` when done. Not yet checked from inside the host. |
| Not created | No snapshots (they would capture secrets), no DNS record, no SSM activation, no new budget (the existing $100 budget and its alerts cover it), no images, no secrets on the host. |

**Next (BACK-117, each gated):**
1. The owner opens browser SSH once and confirms `cat /var/log/kawalys-bootstrap.log`, `docker compose version` and `uname -m` (expect `x86_64`).
2. The DNS name and the Cloudflare record, then narrow 80/443.
3. The digest-pinned deploy override and the Cloudflare client-address change (section 3).
4. `.env.pilot` (mode 0600) with the runtime URLs from Neon.
5. Pull the images, `up`, and run the readiness gate.

**Teardown:** detach and release `kawalys-pilot-ip` (an unattached IP is billed), then delete `kawalys-pilot`.
