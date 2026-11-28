#!/usr/bin/env bash
# Local smoke for the Kawalys pilot Compose stack (BACK-64). Disposable: throwaway passwords, a unique
# project name per run ("kawalys-pilot-smoke-<random>", never "kawalys-pilot" and never the "kawalys-local" dev
# stack), its own image tags and subnet, everything of this run (and only this run) removed at the end.
# It is safe to run on a host that already runs the pilot: nothing of the deployment is touched.
# Run: bash deploy/pilot/smoke.sh      (Git Bash on Windows, or Linux; needs Docker with Compose v2 and curl)
# Prints PASS/FAIL per line, never a password. Exit code 1 if any line fails.
set -u
export MSYS_NO_PATHCONV=1   # Git Bash must not rewrite /paths inside docker arguments

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="kawalys-pilot-smoke-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
case "$PROJECT" in kawalys-pilot-smoke-?*) ;; *) echo "FAIL  refusing to run: unsafe project name"; exit 1 ;; esac
IMAGE_PREFIX="$PROJECT"   # smoke images never reuse the deployment's kawalys-pilot-*:local tags
SUBNET="${KAWALYS_SMOKE_SUBNET:-172.31.77.0/24}"   # not the deployment default 172.30.42.0/24
HTTP_PORT="${KAWALYS_HTTP_PORT:-18080}"
HTTPS_PORT="${KAWALYS_HTTPS_PORT:-18443}"
# Compose gives the shell environment precedence over --env-file, so any exported deployment setting
# (KAWALYS_NODE_ENV=production, role passwords, site address...) would steer this run. Drop every inherited
# KAWALYS_* and POSTGRES_* variable now; the run's own values are exported below or written to its env file.
while IFS= read -r v; do unset "$v"; done < <(compgen -e | grep -E '^(KAWALYS_|POSTGRES_)')
# Compose gives the shell environment precedence over --env-file: pin these so an operator's exported
# deployment values (e.g. KAWALYS_IMAGE_PREFIX=kawalys-pilot) can never steer the smoke at a real pilot.
export KAWALYS_IMAGE_PREFIX="$IMAGE_PREFIX" KAWALYS_NETWORK_SUBNET="$SUBNET"
unset COMPOSE_PROJECT_NAME COMPOSE_FILE
export KAWALYS_HTTP_PORT="$HTTP_PORT" KAWALYS_HTTPS_PORT="$HTTPS_PORT"
# The canonical origin omits the default HTTPS port: the allowlist (and the positive probe) must use that form.
if [ "$HTTPS_PORT" = 443 ]; then BASE="https://localhost"; else BASE="https://localhost:${HTTPS_PORT}"; fi
# Pin the site address and allowlist for this run (the shell wins over --env-file): an exported deployment value must not steer the smoke.
export KAWALYS_SITE_ADDRESS=localhost KAWALYS_ALLOWED_ORIGINS="$BASE"
# Host allowlist (BACK-172): the site host Caddy forwards, and 127.0.0.1 for the bff container healthcheck.
export KAWALYS_ALLOWED_HOSTS="localhost,127.0.0.1"

TMP="$(mktemp -d)"
TMP_NATIVE="$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")"   # native Windows path for docker.exe
ENVF="$TMP_NATIVE/.env.pilot"
COMPOSE_FILE_NATIVE="$(cygpath -m "$HERE/compose.yml" 2>/dev/null || echo "$HERE/compose.yml")"

rand() { od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }
PW_ADMIN="$(rand)"; PW_MIG="$(rand)"; PW_APP="$(rand)"; PW_AUTH="$(rand)"
umask 077
cat > "$TMP/.env.pilot" <<ENV
KAWALYS_SITE_ADDRESS=localhost
KAWALYS_NODE_ENV=development
KAWALYS_ALLOWED_ORIGINS=${BASE}
KAWALYS_ALLOWED_HOSTS=localhost,127.0.0.1
KAWALYS_HTTP_PORT=${HTTP_PORT}
KAWALYS_HTTPS_PORT=${HTTPS_PORT}
KAWALYS_IMAGE_PREFIX=${IMAGE_PREFIX}
KAWALYS_NETWORK_SUBNET=${SUBNET}
POSTGRES_PASSWORD=${PW_ADMIN}
KAWALYS_ROLE_PASSWORD_MIGRATOR=${PW_MIG}
KAWALYS_ROLE_PASSWORD_APP=${PW_APP}
KAWALYS_ROLE_PASSWORD_AUTH=${PW_AUTH}
ENV

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE_NATIVE" --env-file "$ENVF" "$@"; }

cleanup() {
  # Only ever this run's project (guarded above). Images carry this run's prefix, so they go too.
  dc --profile ops down -v --remove-orphans >/dev/null 2>&1
  docker rmi "${IMAGE_PREFIX}-bff:local" "${IMAGE_PREFIX}-web:local" "${IMAGE_PREFIX}-web-sample:local" >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

FAILS=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }
check() { local name="$1"; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }

code() { curl -sk -o "$TMP_NATIVE/body" -w '%{http_code}' --max-time 10 "$@" 2>/dev/null; }
is_code() { [[ "$(code "$2")" = "$1" ]]; }

log() { echo "-- $*"; }
quiet() { "$@" >"$TMP/step.log" 2>&1 || { echo "step failed: $*"; tail -n 40 "$TMP/step.log"; return 1; }; }

command -v docker >/dev/null && command -v curl >/dev/null || { echo "FAIL  docker and curl are required"; exit 1; }
[[ -f "$HERE/compose.yml" ]] || { echo "FAIL  deploy/pilot/compose.yml is missing"; exit 1; }

log "managed profile (BACK-115): config-only checks, no managed container is started"
MANAGED_FILE="$(cygpath -m "$HERE/compose.managed.yml" 2>/dev/null || echo "$HERE/compose.managed.yml")"
MANAGED_ENV="$TMP_NATIVE/managed.env"
cat > "$TMP/managed.env" <<ENV
KAWALYS_SITE_ADDRESS=localhost
KAWALYS_ALLOWED_HOSTS=localhost,127.0.0.1
KAWALYS_DATABASE_URL_APP=postgresql://kawalys_app:dummy@db.example.invalid/kawalys?sslmode=verify-full
KAWALYS_DATABASE_URL_AUTH=postgresql://kawalys_auth:dummy@db.example.invalid/kawalys?sslmode=verify-full
KAWALYS_ADMIN_DATABASE_URL=postgresql://kawalys_admin:dummy@db.example.invalid/kawalys?sslmode=verify-full
KAWALYS_ROLE_PASSWORD_MIGRATOR=dummy-migrator
KAWALYS_ROLE_PASSWORD_APP=dummy-app
KAWALYS_ROLE_PASSWORD_AUTH=dummy-auth
ENV
mdc() { docker compose -f "$MANAGED_FILE" --env-file "$MANAGED_ENV" "$@"; }
mdc_json() { mdc "$@" config --format json; }
# $1 = JavaScript expression over the parsed config `c` (evaluated in a node container); exits 0 when it is true.
managed_json_check() { # $1 expression, rest: extra compose args (for example --profile ops)
  local expr="$1"; shift
  # Node runs in the same pinned image the BFF is built from, so the smoke needs only docker and curl on the host.
  mdc_json "$@" 2>"$TMP/managed.err" | docker run --rm -i --network none node:24.22.3-alpine node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{const c=JSON.parse(d);process.exit(eval(process.argv[1])?0:1)})' "$expr"
}
check "managed: config succeeds with dummy env" quiet mdc config
check "managed: services are exactly bff and web" managed_json_check 'Object.keys(c.services).sort().join()==="bff,web"'
check "managed: services are bff, ops and web under --profile ops" managed_json_check 'Object.keys(c.services).sort().join()==="bff,ops,web"' --profile ops
check "managed: no postgres or pki service" managed_json_check '!("postgres" in c.services)&&!("pki" in c.services)' --profile ops
check "managed: no pg-data, pg-tls or pki-ca volume" managed_json_check '!["pg-data","pg-tls","pki-ca"].some(v=>v in (c.volumes||{}))' --profile ops
check "managed: bff publishes no ports" managed_json_check '!(c.services.bff.ports&&c.services.bff.ports.length)'
check "managed: web publishes 80 and 443 only" managed_json_check 'c.services.web.ports.map(p=>+p.target).sort((a,b)=>a-b).join()==="80,443"'
check "managed: bff healthcheck is the liveness probe (8787/process)" managed_json_check 'c.services.bff.healthcheck.test.join(" ").includes("8787/process")'
check "managed: bff and web keep the hardening (cap_drop ALL, no-new-privileges, web read_only, web user 10001:10001)" managed_json_check '["bff","web"].every(n=>c.services[n].cap_drop.includes("ALL")&&c.services[n].security_opt.includes("no-new-privileges:true"))&&c.services.web.read_only===true&&c.services.web.user==="10001:10001"'
check "managed: bff has trust-proxy, allowed origins and NODE_ENV defaulting to production" managed_json_check 'c.services.bff.environment.NODE_ENV==="production"&&!!c.services.bff.environment.KAWALYS_TRUST_PROXY&&c.services.bff.environment.KAWALYS_ALLOWED_ORIGINS'
grep -v -E '^(KAWALYS_ADMIN_DATABASE_URL|KAWALYS_ROLE_PASSWORD_[A-Z]+)=' "$TMP/managed.env" > "$TMP/managed-runtime.env"
check "managed: config succeeds with runtime vars only (no admin URL or role passwords, no ops profile)" quiet docker compose -f "$MANAGED_FILE" --env-file "$TMP_NATIVE/managed-runtime.env" config
check "managed: no NODE_EXTRA_CA_CERTS and no pg-tls mount" managed_json_check '!("NODE_EXTRA_CA_CERTS" in c.services.bff.environment)&&!JSON.stringify(c).includes("pg-tls")' --profile ops
check "managed: bff gets KAWALYS_ALLOWED_HOSTS from the env file (BACK-172)" managed_json_check 'c.services.bff.environment.KAWALYS_ALLOWED_HOSTS==="localhost,127.0.0.1"'
grep -v '^KAWALYS_ALLOWED_HOSTS=' "$TMP/managed.env" > "$TMP/managed-nohosts.env"
check "managed: config fails and names KAWALYS_ALLOWED_HOSTS when it is unset (BACK-172)" bash -c '! env -u KAWALYS_ALLOWED_HOSTS docker compose -f "$0" --env-file "$1" config >"$2" 2>&1 && grep -q KAWALYS_ALLOWED_HOSTS "$2"' "$MANAGED_FILE" "$TMP_NATIVE/managed-nohosts.env" "$TMP_NATIVE/managed-nohosts.out"
grep -v '^KAWALYS_DATABASE_URL_APP=' "$TMP/managed.env" > "$TMP/managed-missing.env"
MANAGED_ENV_MISSING="$TMP_NATIVE/managed-missing.env"
check "managed: config fails and names KAWALYS_DATABASE_URL_APP when it is unset" bash -c '! docker compose -f "$0" --env-file "$1" config >"$2" 2>&1 && grep -q KAWALYS_DATABASE_URL_APP "$2"' "$MANAGED_FILE" "$MANAGED_ENV_MISSING" "$TMP_NATIVE/managed-missing.out"

# Digest-pinned deploy override (BACK-117): config-only, dummy digests, nothing is pulled or built.
DEPLOY_FILE="$(cygpath -m "$HERE/compose.deploy.yml" 2>/dev/null || echo "$HERE/compose.deploy.yml")"
DIGEST_A="$(printf 'a%.0s' $(seq 64))"; DIGEST_B="$(printf 'b%.0s' $(seq 64))"
{ cat "$TMP/managed.env"
  echo "KAWALYS_BFF_IMAGE=ghcr.io/example/bff@sha256:${DIGEST_A}"
  echo "KAWALYS_WEB_IMAGE=ghcr.io/example/web@sha256:${DIGEST_B}"; } > "$TMP/deploy.env"
DEPLOY_ENV="$TMP_NATIVE/deploy.env"
ddc_json() { docker compose -f "$MANAGED_FILE" -f "$DEPLOY_FILE" --env-file "$DEPLOY_ENV" --profile ops config --format json; }
deploy_json_check() {
  ddc_json 2>"$TMP/deploy.err" | docker run --rm -i --network none node:24.22.3-alpine node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{const c=JSON.parse(d);process.exit(eval(process.argv[1])?0:1)})' "$1"
}
check "deploy: config succeeds with dummy digest refs" quiet docker compose -f "$MANAGED_FILE" -f "$DEPLOY_FILE" --env-file "$DEPLOY_ENV" config
check "deploy: bff and ops resolve to the identical digest-pinned image" deploy_json_check 'c.services.bff.image===c.services.ops.image&&c.services.bff.image.includes("@sha256:")'
check "deploy: web resolves to a digest-pinned image" deploy_json_check 'c.services.web.image.includes("@sha256:")'
check "deploy: no service has a build key (the host never builds)" deploy_json_check '!Object.values(c.services).some(s=>"build" in s)'
check "deploy: pull_policy is missing for every service" deploy_json_check 'Object.values(c.services).every(s=>s.pull_policy==="missing")'
grep -v '^KAWALYS_BFF_IMAGE=' "$TMP/deploy.env" > "$TMP/deploy-missing.env"
check "deploy: config fails and names KAWALYS_BFF_IMAGE when it is unset" bash -c '! docker compose -f "$0" -f "$1" --env-file "$2" config >"$3" 2>&1 && grep -q KAWALYS_BFF_IMAGE "$3"' "$MANAGED_FILE" "$DEPLOY_FILE" "$TMP_NATIVE/deploy-missing.env" "$TMP_NATIVE/deploy-missing.out"

# Cloudflare Origin CA override (BACK-117): config-only. The default (no override file) must not mount any certificate.
ORIGIN_FILE="$(cygpath -m "$HERE/compose.origin-cert.yml" 2>/dev/null || echo "$HERE/compose.origin-cert.yml")"
ORIGIN_SNIPPET="$(cygpath -m "$HERE/tls-origin.caddy" 2>/dev/null || echo "$HERE/tls-origin.caddy")"
ORIGIN_DIR="$TMP/origincert"; mkdir -p "$ORIGIN_DIR"; chmod 777 "$ORIGIN_DIR"   # throwaway, written by uid 10001 below
ORIGIN_DIR_NATIVE="$TMP_NATIVE/origincert"
{ cat "$TMP/deploy.env"; echo "KAWALYS_ORIGIN_CERT_DIR=${ORIGIN_DIR_NATIVE}"; } > "$TMP/origin.env"
ORIGIN_ENV="$TMP_NATIVE/origin.env"
origin_json_check() {
  docker compose -f "$MANAGED_FILE" -f "$DEPLOY_FILE" -f "$ORIGIN_FILE" --env-file "$ORIGIN_ENV" config --format json 2>"$TMP/origin.err" | docker run --rm -i --network none node:24.22.3-alpine node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{const c=JSON.parse(d);process.exit(eval(process.argv[1])?0:1)})' "$1"
}
check "origin-cert: config succeeds with the override and KAWALYS_ORIGIN_CERT_DIR set" quiet docker compose -f "$MANAGED_FILE" -f "$DEPLOY_FILE" -f "$ORIGIN_FILE" --env-file "$ORIGIN_ENV" config
check "origin-cert: web mounts tls-origin.caddy into tls.d and the cert directory at /certs, both read-only" origin_json_check 'const v=c.services.web.volumes,a=v.find(x=>x.target==="/etc/caddy/tls.d/origin.caddy"),b=v.find(x=>x.target==="/certs");!!a&&a.read_only===true&&a.source.endsWith("tls-origin.caddy")&&!!b&&b.read_only===true&&b.source.endsWith("origincert")'
check "origin-cert: the web hardening and the caddy data volumes are unchanged" origin_json_check 'const w=c.services.web,t=w.volumes.map(x=>x.target);w.read_only===true&&w.user==="10001:10001"&&w.cap_drop.includes("ALL")&&t.includes("/data")&&t.includes("/config")'
check "origin-cert: without the override file no certificate directory is mounted (default unchanged)" deploy_json_check '!JSON.stringify(c.services.web.volumes).includes("/certs")&&!JSON.stringify(c.services.web.volumes).includes("tls.d")'
grep -v '^KAWALYS_ORIGIN_CERT_DIR=' "$TMP/origin.env" > "$TMP/origin-missing.env"
check "origin-cert: config fails and names KAWALYS_ORIGIN_CERT_DIR when it is unset" bash -c '! docker compose -f "$0" -f "$1" -f "$2" --env-file "$3" config >"$4" 2>&1 && grep -q KAWALYS_ORIGIN_CERT_DIR "$4"' "$MANAGED_FILE" "$DEPLOY_FILE" "$ORIGIN_FILE" "$TMP_NATIVE/origin-missing.env" "$TMP_NATIVE/origin-missing.out"

# Deploy preflight (BACK-117 review): rejects mutable tags and missing refs; prints no value from the file.
PF="$HERE/preflight-deploy.sh"
printf 'KAWALYS_BFF_IMAGE=ghcr.io/kemetra-labs/kawalys-bff@sha256:%s
KAWALYS_WEB_IMAGE=ghcr.io/kemetra-labs/kawalys-web@sha256:%s
KAWALYS_ALLOWED_HOSTS=Kawalys.example.com,localhost,127.0.0.1
SECRET_X=hunter2
' "$DIGEST_A" "$DIGEST_B" > "$TMP/pf-ok.env"
printf 'KAWALYS_BFF_IMAGE=ghcr.io/kemetra-labs/kawalys-bff:abc123
KAWALYS_WEB_IMAGE=ghcr.io/kemetra-labs/kawalys-web@sha256:%s
KAWALYS_ALLOWED_HOSTS=localhost,127.0.0.1
SECRET_X=hunter2
' "$DIGEST_B" > "$TMP/pf-tag.env"
printf 'KAWALYS_WEB_IMAGE=ghcr.io/kemetra-labs/kawalys-web@sha256:%s
KAWALYS_ALLOWED_HOSTS=localhost,127.0.0.1
SECRET_X=hunter2
' "$DIGEST_B" > "$TMP/pf-missing.env"
check "preflight: accepts two valid digest refs" bash "$PF" "$TMP/pf-ok.env"
check "preflight: rejects a tag-only ref, names the variable, leaks no value" bash -c 'out="$(bash "$0" "$1" 2>&1)"; rc=$?; [ $rc -ne 0 ] && echo "$out" | grep -q KAWALYS_BFF_IMAGE && ! echo "$out" | grep -q "hunter2\|abc123"' "$PF" "$TMP/pf-tag.env"
grep -v '^KAWALYS_ALLOWED_HOSTS=' "$TMP/pf-ok.env" > "$TMP/pf-nohosts.env"
grep -v '^KAWALYS_ALLOWED_HOSTS=' "$TMP/pf-ok.env" > "$TMP/pf-nolocal.env"; echo "KAWALYS_ALLOWED_HOSTS=kawalys.example.com,localhost" >> "$TMP/pf-nolocal.env"
grep -v '^KAWALYS_ALLOWED_HOSTS=' "$TMP/pf-ok.env" > "$TMP/pf-wrongport.env"; echo "KAWALYS_ALLOWED_HOSTS=kawalys.example.com,localhost,127.0.0.1:9999" >> "$TMP/pf-wrongport.env"
grep -v '^KAWALYS_ALLOWED_HOSTS=' "$TMP/pf-ok.env" > "$TMP/pf-empty.env"; echo "KAWALYS_ALLOWED_HOSTS=" >> "$TMP/pf-empty.env"
check "preflight: rejects a missing KAWALYS_ALLOWED_HOSTS, names it (BACK-172)" bash -c 'out="$(bash "$0" "$1" 2>&1)"; rc=$?; [ $rc -ne 0 ] && echo "$out" | grep -q KAWALYS_ALLOWED_HOSTS' "$PF" "$TMP/pf-nohosts.env"
check "preflight: rejects an empty KAWALYS_ALLOWED_HOSTS" bash -c '! bash "$0" "$1" >/dev/null 2>&1' "$PF" "$TMP/pf-empty.env"
check "preflight: rejects a host list without 127.0.0.1 (the healthcheck Host)" bash -c '! bash "$0" "$1" >/dev/null 2>&1' "$PF" "$TMP/pf-nolocal.env"
check "preflight: rejects 127.0.0.1 on a port other than 8787 (the healthcheck Host is 127.0.0.1:8787)" bash -c '! bash "$0" "$1" >/dev/null 2>&1' "$PF" "$TMP/pf-wrongport.env"
check "preflight: rejects a missing variable" bash -c '! bash "$0" "$1" >/dev/null 2>&1' "$PF" "$TMP/pf-missing.env"

grep -v '^KAWALYS_ALLOWED_HOSTS=' "$TMP/.env.pilot" > "$TMP/stack-nohosts.env"
check "compose.yml: config fails and names KAWALYS_ALLOWED_HOSTS when it is unset (BACK-172)" bash -c 'env -u KAWALYS_ALLOWED_HOSTS docker compose -p x -f "$0" --env-file "$1" config >"$2" 2>&1; rc=$?; [ $rc -ne 0 ] && grep -q KAWALYS_ALLOWED_HOSTS "$2"' "$COMPOSE_FILE_NATIVE" "$TMP_NATIVE/stack-nohosts.env" "$TMP_NATIVE/stack-nohosts.out"

log "isolation: every resource of this run belongs to $PROJECT, none to the deployment project kawalys-pilot"
log "build images and start postgres"
quiet dc build || { fail "images build"; exit 1; }
pass "images build"
check "caddy validate accepts the Caddyfile with KAWALYS_TRUSTED_PROXIES set to two CIDRs (BACK-117)" quiet docker run --rm --network none -e KAWALYS_SITE_ADDRESS=localhost -e "KAWALYS_TRUSTED_PROXIES=173.245.48.0/20 2400:cb00::/32" "${IMAGE_PREFIX}-web:local" caddy validate --config /etc/caddy/Caddyfile
check "caddy validate accepts the Caddyfile with the tls.d import glob matching no files (default, BACK-117)" quiet docker run --rm --network none -e KAWALYS_SITE_ADDRESS=localhost "${IMAGE_PREFIX}-web:local" caddy validate --config /etc/caddy/Caddyfile
# Origin CA override (BACK-117): a throwaway self-signed pair, generated as uid 10001 in the openssl image pinned in compose.yml.
quiet docker run --rm --network none --user 10001:10001 -v "${ORIGIN_DIR_NATIVE}:/out" alpine/openssl:3.5.4 req -x509 -newkey rsa:2048 -nodes -keyout /out/origin.key -out /out/origin.pem -days 1 -subj "/CN=localhost"
check "origin-cert: caddy validate accepts the real Caddyfile with tls-origin.caddy and a mounted certificate pair" quiet docker run --rm --network none -e KAWALYS_SITE_ADDRESS=localhost -v "${ORIGIN_SNIPPET}:/etc/caddy/tls.d/origin.caddy:ro" -v "${ORIGIN_DIR_NATIVE}:/certs:ro" "${IMAGE_PREFIX}-web:local" caddy validate --config /etc/caddy/Caddyfile
check "origin-cert: caddy validate rejects tls-origin.caddy when the certificate files are missing (the check is not vacuous)" bash -c '! docker run --rm --network none -e KAWALYS_SITE_ADDRESS=localhost -v "$0:/etc/caddy/tls.d/origin.caddy:ro" "$1" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1' "$ORIGIN_SNIPPET" "${IMAGE_PREFIX}-web:local"

log "web image reads the Descope project id at build time (D3(a))"
# The id is a public identifier passed as a build arg (images.yml). No default in the Dockerfile; ENV is set before vite build.
check "web.Dockerfile: ARG VITE_KAWALYS_DESCOPE_PROJECT_ID has no default value" bash -c 'grep -qE "^ARG VITE_KAWALYS_DESCOPE_PROJECT_ID\$" "$0" && ! grep -qE "^ARG VITE_KAWALYS_DESCOPE_PROJECT_ID=" "$0"' "$HERE/web.Dockerfile"
check "web.Dockerfile: the ARG is exported as ENV before vite build" bash -c 'a=$(grep -n "^ARG VITE_KAWALYS_DESCOPE_PROJECT_ID" "$0" | head -1 | cut -d: -f1); e=$(grep -n "^ENV .*VITE_KAWALYS_DESCOPE_PROJECT_ID=" "$0" | head -1 | cut -d: -f1); b=$(grep -n "vite build" "$0" | head -1 | cut -d: -f1); [ -n "$a" ] && [ -n "$e" ] && [ -n "$b" ] && [ "$a" -lt "$e" ] && [ "$e" -lt "$b" ]' "$HERE/web.Dockerfile"
SAMPLE_ID=PSAMPLE000000000000000000000000
REAL_ID=P3MW4c80PMtyApvtGSONYmXy9fGt   # the pilot's public Descope project id (images.yml); must never be the default build's content
SAMPLE_IMG="${IMAGE_PREFIX}-web-sample:local"
ROOT_NATIVE="$(cygpath -m "$HERE/../.." 2>/dev/null || echo "$HERE/../..")"
DOCKERFILE_NATIVE="$(cygpath -m "$HERE/web.Dockerfile" 2>/dev/null || echo "$HERE/web.Dockerfile")"
check "web image builds WITH the project id build arg" quiet docker build -f "$DOCKERFILE_NATIVE" --build-arg "VITE_KAWALYS_DESCOPE_PROJECT_ID=$SAMPLE_ID" -t "$SAMPLE_IMG" "$ROOT_NATIVE"
files_with() { # $1 image, $2 needle, $3 directory (default /): one path per file under it holding the needle
  docker run --rm --entrypoint sh "$1" -c 'find "$1" -xdev -type f -not -path "/proc/*" -exec grep -lF -- "$0" {} + 2>/dev/null' "$2" "${3:-/}" 2>/dev/null | tr -d '\r'
}
SAMPLE_FILES="$(files_with "$SAMPLE_IMG" "$SAMPLE_ID")"
DEFAULT_FILES="$(files_with "${IMAGE_PREFIX}-web:local" "$SAMPLE_ID" /srv)$(files_with "${IMAGE_PREFIX}-web:local" "$REAL_ID" /srv)"
check "the sample id is in the built assets (at least one /srv/assets/*.js)" bash -c 'echo "$0" | grep -q "^/srv/assets/.*\.js$"' "$SAMPLE_FILES"
check "the sample id is nowhere else in the web image (only /srv/assets/*.js hold it)" bash -c '[ -n "$0" ] && ! echo "$0" | grep -qv "^/srv/assets/.*\.js$"' "$SAMPLE_FILES"
check "the sample id is not in the image environment or config" bash -c '! docker inspect --format "{{json .Config}}" "$0" | grep -qF "$1"' "$SAMPLE_IMG" "$SAMPLE_ID"
check "the default web image (no build arg) serves neither the sample id nor the pilot id (nothing under /srv)" test -z "$DEFAULT_FILES"

log "bundled stack passes KAWALYS_TRUSTED_PROXIES to Caddy like the managed profile (auth review F-003)"
NODE_EVAL='let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{const c=JSON.parse(d);process.exit(eval(process.argv[1])?0:1)})'
stack_json_check() { # $1 JavaScript expression over the parsed compose.yml config `c`
  dc config --format json 2>"$TMP/stack.err" | docker run --rm -i --network none node:24.22.3-alpine node -e "$NODE_EVAL" "$1"
}
CF_RANGES="173.245.48.0/20 2400:cb00::/32"
check "compose.yml: web gets KAWALYS_TRUSTED_PROXIES, default 127.0.0.1/32 (trust nobody)" stack_json_check 'c.services.web.environment.KAWALYS_TRUSTED_PROXIES==="127.0.0.1/32"'
# A value in the shell wins over the env file in Compose, so exporting it for this one subshell is the same as setting it in .env.pilot.
check "compose.yml: a value set for the stack reaches web unchanged" bash -c 'export KAWALYS_TRUSTED_PROXIES="$1"; docker compose -p "$2" -f "$3" --env-file "$4" config --format json 2>/dev/null | docker run --rm -i --network none node:24.22.3-alpine node -e "$0" "c.services.web.environment.KAWALYS_TRUSTED_PROXIES===\"$1\""' "$NODE_EVAL" "$CF_RANGES" "$PROJECT" "$COMPOSE_FILE_NATIVE" "$ENVF"

quiet dc up -d --wait postgres || { fail "postgres healthy"; exit 1; }
pass "postgres healthy"
pgver="$(dc exec -T postgres psql -U kawalys_admin -d kawalys -tAc 'SHOW server_version' 2>/dev/null | tr -d '[:space:]')"
if [[ "$pgver" =~ ^18\.7($|[^0-9]) ]]; then pass "postgres reports server_version 18.7 (BACK-113)"; else fail "postgres reports server_version 18.7 (BACK-113), got '${pgver:-none}'"; fi

log "operator step: provision, then migrate (before bff starts)"
quiet dc --profile ops run --rm ops provision --apply && pass "db-admin provision --apply" || { fail "db-admin provision --apply"; exit 1; }
quiet dc --profile ops run --rm ops migrate --apply && pass "db-admin migrate --apply" || { fail "db-admin migrate --apply"; exit 1; }

log "production without auth must refuse to start (fail closed)"
# Override the smoke default back to production for this one run.
# Bounded: a hang counts as FAIL (rc 124). `timeout` exists in Git Bash and on Linux; else a background watchdog.
run_bounded() { # $1 seconds, then the command; output in $TMP/bounded.out, status in BOUNDED_RC
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@" >"$TMP/bounded.out" 2>&1; BOUNDED_RC=$?
  else
    "$@" >"$TMP/bounded.out" 2>&1 & local pid=$! waited=0
    while kill -0 "$pid" 2>/dev/null && [[ "$waited" -lt "$secs" ]]; do sleep 1; waited=$((waited + 1)); done
    if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null; BOUNDED_RC=124; else wait "$pid"; BOUNDED_RC=$?; fi
  fi
}
run_bounded 60 env KAWALYS_NODE_ENV=production docker compose -p "$PROJECT" -f "$COMPOSE_FILE_NATIVE" --env-file "$ENVF" run --rm --no-deps -T bff
PROD_RC=$BOUNDED_RC; PROD_OUT="$(cat "$TMP/bounded.out")"
check "NODE_ENV=production without Descope settings exits non-zero (not a timeout)" bash -c '[ "$0" -ne 0 ] && [ "$0" -ne 124 ]' "$PROD_RC"
check "refusal names the missing settings, no secret" bash -c "echo \"\$0\" | grep -q 'required in production'" "$PROD_OUT"

log "start bff and web"
quiet dc up -d --wait bff web && pass "bff healthy, web started" || { fail "bff healthy, web started"; dc logs --tail 30 bff web; exit 1; }

# Caddy needs a moment to issue its internal certificate.
for _ in $(seq 1 20); do [[ "$(code "$BASE/api/process")" = 200 ]] && break; sleep 1; done

check "GET /api/process -> 200 (liveness through Caddy)" is_code 200 "$BASE/api/process"
check "GET /api/health -> 200 after migrate" is_code 200 "$BASE/api/health"
check "GET /api/health body is ready:true" grep -q '"ready":true' "$TMP/body"
check "GET / serves the app (HTML with the app root)" bash -c "curl -sk --max-time 10 '$BASE/' | grep -q 'id=\"root\"'"
check "GET /some/spa/route falls back to index.html" bash -c "curl -sk --max-time 10 '$BASE/investigations/x' | grep -q 'id=\"root\"'"
check "GET /api/portfolio -> 404 (deny-all, Descope unset)" is_code 404 "$BASE/api/portfolio"
check "GET /api/portfolio body is not_found" grep -q 'not_found' "$TMP/body"
# Host allowlist (BACK-172): the BFF answers 404 to an unlisted Host and 200 to a listed one, and the container healthcheck
# (Host 127.0.0.1:8787) stays healthy. Probed inside the bff container, so Caddy's own host routing is not what answers.
bff_host_probe() { # $1 Host header value; prints the HTTP status
  dc exec -T bff sh -c 'wget -S -q -O /dev/null --header "Host: $0" http://127.0.0.1:8787/process 2>&1 | grep -m1 "HTTP/" | awk "{print \$2}"' "$1" | tr -d '\r\n'
}
check "unknown Host header reaches the BFF -> 404 (BACK-172)" test "$(bff_host_probe evil.example)" = 404
check "a Host with a non-numeric port -> 404 (BACK-172)" test "$(bff_host_probe localhost:evil)" = 404
check "listed Host (the site host) -> 200 (BACK-172)" test "$(bff_host_probe localhost)" = 200
check "listed Host with a port -> 200 (BACK-172)" test "$(bff_host_probe localhost:18443)" = 200
check "bff container healthcheck is healthy with the allowlist on (BACK-172)" test "$(docker inspect --format '{{.State.Health.Status}}' "$(dc ps -q bff)" | tr -d '\r\n')" = healthy
check "bff container healthcheck uses liveness (/process), not the database probe" grep -q "8787/process" "$HERE/compose.yml"
check "bff container healthcheck does not call /health" bash -c '! grep -q "8787/health" "$0"' "$HERE/compose.yml"
check_headers() { # $1 label, $2 url
  local h; h="$(curl -skI --max-time 10 "$2")"
  check "security header on $1: Strict-Transport-Security" bash -c 'echo "$0" | grep -qi "^strict-transport-security:"' "$h"
  check "security header on $1: X-Content-Type-Options nosniff" bash -c 'echo "$0" | grep -qi "^x-content-type-options: nosniff"' "$h"
  check "security header on $1: Referrer-Policy no-referrer" bash -c 'echo "$0" | grep -qi "^referrer-policy: no-referrer"' "$h"
  check "security header on $1: X-Frame-Options DENY" bash -c 'echo "$0" | grep -qi "^x-frame-options: deny"' "$h"
}
check_headers "/" "$BASE/"
check_headers "/api/process" "$BASE/api/process"
check_headers "/sign-in" "$BASE/sign-in"

log "sign-in page edge (D3(a)): SPA fallback, no-store, enforcing CSP"
check "GET /sign-in serves the app (SPA fallback)" bash -c "curl -sk --max-time 10 '$BASE/sign-in' | grep -q 'id=\"root\"'"
check "GET /sign-in?t=<token> still serves the app (the magic-link return)" bash -c "curl -sk --max-time 10 '$BASE/sign-in?t=abc.def' | grep -q 'id=\"root\"'"
check "GET /sign-in/ serves the app" bash -c "curl -sk --max-time 10 '$BASE/sign-in/' | grep -q 'id=\"root\"'"
SIGNIN_H="$(curl -skI --max-time 10 "$BASE/sign-in?t=abc.def" | tr -d '\r')"
ROOT_H="$(curl -skI --max-time 10 "$BASE/" | tr -d '\r')"
hdr() { echo "$1" | grep -i "^$2:" | head -n 1 | sed 's/^[^:]*: *//'; }
directive() { # $1 policy, $2 directive name: the directive's value list
  echo "$1" | tr ';' '\n' | sed 's/^ *//' | grep -E "^$2( |\$)" | head -n 1 | sed "s/^$2 *//"
}
has_directive() { # $1 policy, $2 whole directive text, exact
  echo "$1" | tr ';' '\n' | sed 's/^ *//' | grep -qxF "$2"
}
SIGNIN_CSP="$(hdr "$SIGNIN_H" content-security-policy)"
ROOT_CSP="$(hdr "$ROOT_H" content-security-policy)"
check "/sign-in: Content-Security-Policy appears exactly once" test "$(echo "$SIGNIN_H" | grep -ic '^content-security-policy:')" = 1
check "/: Content-Security-Policy appears exactly once" test "$(echo "$ROOT_H" | grep -ic '^content-security-policy:')" = 1
check "images.yml passes VITE_KAWALYS_DESCOPE_PROJECT_ID as a build-arg to the web image build" bash -c 'awk "/file: deploy\/pilot\/web.Dockerfile/{f=1} f&&/build-args:/{b=1} b&&/VITE_KAWALYS_DESCOPE_PROJECT_ID=/{ok=1} f&&/tags:/{exit} END{exit !ok}" "$0"' "$HERE/../../.github/workflows/images.yml"
SIGNIN_SCRIPT_SRC="$(directive "$SIGNIN_CSP" script-src)"
check "/sign-in: Cache-Control no-store" bash -c 'echo "$0" | grep -qi "^cache-control: .*no-store"' "$SIGNIN_H"
check "/: Cache-Control no-store is scoped to /sign-in only" bash -c '! echo "$0" | grep -qi "^cache-control: .*no-store"' "$ROOT_H"
check "/sign-in: Content-Security-Policy is present" test -n "$SIGNIN_CSP"
check "/sign-in: CSP connect-src allows 'self' and https://api.descope.com" bash -c 'echo "$0" | grep -qF "connect-src '"'self'"' https://api.descope.com"' "$SIGNIN_CSP"
check "/sign-in: CSP default-src 'self'" has_directive "$SIGNIN_CSP" "default-src 'self'"
check "/sign-in: CSP object-src 'none'" has_directive "$SIGNIN_CSP" "object-src 'none'"
check "/sign-in: CSP frame-ancestors 'none'" has_directive "$SIGNIN_CSP" "frame-ancestors 'none'"
check "/sign-in: CSP base-uri 'self'" has_directive "$SIGNIN_CSP" "base-uri 'self'"
check "/sign-in: CSP font-src is exactly 'self' data: and the Descope components CDN (release 6, O2)" has_directive "$SIGNIN_CSP" "font-src 'self' data: https://descopecdn.com"
check "/: CSP font-src stays 'self' data: (no Descope host on app pages)" has_directive "$ROOT_CSP" "font-src 'self' data:"
check "/sign-in: CSP script-src has no unsafe-inline, unsafe-eval, wildcard, data:, unpkg or jsdelivr" bash -c '[ -n "$0" ] && ! echo "$0" | grep -qE "unsafe-inline|unsafe-eval|\*|data:|unpkg|jsdelivr"' "$SIGNIN_SCRIPT_SRC"
check "/sign-in: CSP script-src allows 'self' and the Descope components CDN" bash -c 'echo "$0" | grep -qF "'"'self'"'" && echo "$0" | grep -qF "https://descopecdn.com"' "$SIGNIN_SCRIPT_SRC"
check "/sign-in: no Content-Security-Policy-Report-Only header is left (enforcing only)" bash -c '! echo "$0" | grep -qi "^content-security-policy-report-only:"' "$SIGNIN_H"
check "/: Content-Security-Policy is present" test -n "$ROOT_CSP"
check "/: CSP names no Descope host (the vendor allowances are for /sign-in only)" bash -c '[ -n "$0" ] && ! echo "$0" | grep -qi descope' "$ROOT_CSP"
check "/: CSP script-src is exactly 'self'" test "$(directive "$ROOT_CSP" script-src)" = "'self'"
check "/: no Content-Security-Policy-Report-Only header is left (enforcing only)" bash -c '! echo "$0" | grep -qi "^content-security-policy-report-only:"' "$ROOT_H"
check "index.html has no inline script (every <script> has src), so script-src 'self' fits" bash -c 'h="$(curl -sk --max-time 10 "$0/")"; [ "$(echo "$h" | grep -oE "<script[^>]*>" | wc -l)" -ge 1 ] && ! echo "$h" | grep -oE "<script[^>]*>" | grep -qv "src="' "$BASE"
check "bundled stack: the running web container has KAWALYS_TRUSTED_PROXIES" bash -c '[ "$(docker exec "$0" printenv KAWALYS_TRUSTED_PROXIES | tr -d "\r")" = "127.0.0.1/32" ]' "$(dc ps -q web)"
published() { docker ps --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$1" --format '{{.Ports}}' | grep -c -- '->'; }
check "bff publishes no host port (docker compose port bff 8787 empty)" bash -c '[ -z "$(docker compose -p "$2" -f "$0" --env-file "$1" port bff 8787 2>/dev/null | grep -v "^:0$")" ]' "$COMPOSE_FILE_NATIVE" "$ENVF" "$PROJECT"
check "bff has no host port mapping in docker ps" test "$(published bff)" = 0
check "postgres publishes no host port (docker compose port postgres 5432 empty)" bash -c '[ -z "$(docker compose -p "$2" -f "$0" --env-file "$1" port postgres 5432 2>/dev/null | grep -v "^:0$")" ]' "$COMPOSE_FILE_NATIVE" "$ENVF" "$PROJECT"
check "postgres has no host port mapping in docker ps" test "$(published postgres)" = 0
check "only web publishes ports (80/443)" bash -c "docker ps --filter label=com.docker.compose.project=$PROJECT --format '{{.Names}} {{.Ports}}' | awk '/->/ {print \$1}' | grep -v -- '-web-' | wc -l | grep -qx 0"

log "image secret scan (no generated password, no .env file)"
# BusyBox grep has no --exclude-dir, so walk the image's own filesystem with find. Prints the number of files holding a password.
SCAN_SH='n=0; for p in $SCAN_PWS; do c=$(find / -xdev -type f -not -path "/tmp/*" -not -path "/proc/*" -exec grep -lF -- "$p" {} + 2>/dev/null | wc -l); n=$((n + c)); done; echo $n'
scan_image() { # $1 image
  docker run --rm -e "SCAN_PWS=$PW_ADMIN $PW_MIG $PW_APP $PW_AUTH" --entrypoint sh "$1" -c "$SCAN_SH" 2>/dev/null | tail -n 1
}
scan_control() { # $1 image: a planted password must be found (proves the scanner can see files)
  docker run --rm --user root -e "SCAN_PWS=$PW_APP" --entrypoint sh "$1" -c "echo \"\$SCAN_PWS\" > /usr/planted-control; $SCAN_SH" 2>/dev/null | tail -n 1
}
dotenv_files() { # $1 image
  docker run --rm --entrypoint sh "$1" -c "find / -xdev \( -name '.env' -o -name '.env.*' \) -not -path '/proc/*' -not -path '*/node_modules/*' 2>/dev/null | wc -l" 2>/dev/null | tail -n 1
}
BFF_IMG="$(dc config --images | grep '/bff\|-bff' | head -n 1)"
WEB_IMG="$(dc config --images | grep '/web\|-web' | head -n 1)"
check "scanner control: a planted password is detected" test "$(scan_control "$BFF_IMG")" -ge 1
check "bff image contains no generated password" test "$(scan_image "$BFF_IMG")" = 0
check "web image contains no generated password" test "$(scan_image "$WEB_IMG")" = 0
check "bff image contains no .env file" test "$(dotenv_files "$BFF_IMG")" = 0
check "web image contains no .env file" test "$(dotenv_files "$WEB_IMG")" = 0
check "bff runs as non-root" test "$(dc exec -T bff id -u | tr -d '\r')" != 0

log "container hardening"
WEB_ID="$(dc ps -q web)"; BFF_ID="$(dc ps -q bff)"
insp() { docker inspect --format "$1" "$2"; }
check "web: CapDrop ALL" bash -c 'echo "$0" | grep -q ALL' "$(insp '{{json .HostConfig.CapDrop}}' "$WEB_ID")"
check "web: no added capabilities" bash -c '[[ "$0" = null || "$0" = "[]" ]]' "$(insp '{{json .HostConfig.CapAdd}}' "$WEB_ID")"
check "web: runs as a non-root user" bash -c '[[ "$(docker exec "$0" id -u)" != 0 ]]' "$WEB_ID"
check "web: no-new-privileges" bash -c 'echo "$0" | grep -q no-new-privileges' "$(insp '{{json .HostConfig.SecurityOpt}}' "$WEB_ID")"
check "web: read-only root filesystem" test "$(insp '{{.HostConfig.ReadonlyRootfs}}' "$WEB_ID")" = true
check "web: effective capabilities are empty" bash -c 'docker exec "$0" grep -q "^CapEff:.*0000000000000000$" /proc/1/status' "$WEB_ID"
check "bff: CapDrop ALL and no-new-privileges" bash -c 'echo "$0" | grep -q ALL && echo "$1" | grep -q no-new-privileges' "$(insp '{{json .HostConfig.CapDrop}}' "$BFF_ID")" "$(insp '{{json .HostConfig.SecurityOpt}}' "$BFF_ID")"
check "bff: effective capabilities are empty" bash -c 'docker exec "$0" grep -q "^CapEff:.*0000000000000000$" /proc/1/status' "$BFF_ID"

check "CA private key is not in the pg-tls volume seen by bff" bash -c '! docker exec "$0" ls /pki | grep -q "ca.key"' "$BFF_ID"
check "bff sees ca.crt, server.crt, server.key only" test "$(docker exec "$BFF_ID" ls /pki | tr -d '\r' | sort | tr '\n' ' ')" = "ca.crt server.crt server.key "

log "sign-in limit is per client behind Caddy (forged X-Forwarded-For does not bypass it)"
LIMITED=no
for i in $(seq 1 14); do
  [[ "$(code -X POST -H "X-Forwarded-For: 203.0.113.$i" "$BASE/api/auth/session")" = 429 ]] && { LIMITED=yes; break; }
done
check "14 sign-in attempts with 14 forged X-Forwarded-For values hit 429" test "$LIMITED" = yes

log "origin check on state-changing routes (audit M1)"
# NODE_ENV=development here, so a request with no Origin is allowed (the sign-in limit test above relies on it).
# POST /api/auth/session with no Authorization header is 401->404 for auth reasons only if the origin check lets it
# through, so a foreign Origin cannot be told apart by status alone. Use a malformed JSON body instead: the body
# parser answers 400 validation_error, which only happens when the origin check passed.
EVIL_CODE="$(code -X POST -H "Origin: https://evil.example" -H "Content-Type: application/json" --data '{bad' "$BASE/api/auth/session")"
check "foreign Origin status is 404" test "$EVIL_CODE" = 404
OK_CODE="$(code -X POST -H "Origin: $BASE" -H "Content-Type: application/json" --data '{bad' "$BASE/api/auth/session")"
check "the site's own Origin passes the check (malformed body -> 400, not 404)" test "$OK_CODE" = 400
SF_CODE="$(code -X POST -H "Sec-Fetch-Site: cross-site" -H "Content-Type: application/json" --data '{bad' "$BASE/api/auth/session")"
check "Sec-Fetch-Site cross-site -> 404" test "$SF_CODE" = 404

log "database outage: unknown is never healthy"
dc stop postgres >/dev/null 2>&1
saw503=no
for _ in $(seq 1 10); do [[ "$(code "$BASE/api/health")" = 503 ]] && { saw503=yes; break; }; sleep 1; done
check "postgres stopped -> /api/health 503 within 10 s" test "$saw503" = yes
check "liveness stays 200 while the database is down" is_code 200 "$BASE/api/process"
dc start postgres >/dev/null 2>&1
back=no
for _ in $(seq 1 30); do [[ "$(code "$BASE/api/health")" = 200 ]] && { back=yes; break; }; sleep 1; done
check "postgres restarted -> /api/health 200 again" test "$back" = yes

log "isolation check"
check "smoke project name is not kawalys-pilot" test "$PROJECT" != kawalys-pilot
check "every smoke volume is named for the smoke project" bash -c '[ "$(docker volume ls -q --filter "label=com.docker.compose.project=$0" | grep -vc "^$0_")" = 0 ] && [ "$(docker volume ls -q --filter "label=com.docker.compose.project=$0" | wc -l)" -ge 5 ]' "$PROJECT"
check "smoke images are tagged with the smoke prefix, not kawalys-pilot-*:local" bash -c '! docker compose -p "$0" -f "$1" --env-file "$2" config --images | grep -q "^kawalys-pilot-\(bff\|web\):local$"' "$PROJECT" "$COMPOSE_FILE_NATIVE" "$ENVF"
check "no volume of the smoke project is named like a deployment volume" bash -c '! docker volume ls -q --filter "label=com.docker.compose.project=$0" | grep -q "^kawalys-pilot_"' "$PROJECT"

echo
if [[ "$FAILS" -eq 0 ]]; then echo "SMOKE RESULT: ALL PASS"; else echo "SMOKE RESULT: $FAILS FAILED"; fi
[[ "$FAILS" -eq 0 ]]
