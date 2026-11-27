#!/usr/bin/env bash
# Local smoke for the Kawalys pilot Compose stack (BACK-64). Disposable: throwaway passwords, project
# "kawalys-pilot" (never the "kawalys-local" dev stack), everything removed at the end.
# Run: bash deploy/pilot/smoke.sh      (Git Bash on Windows, or Linux; needs Docker with Compose v2 and curl)
# Prints PASS/FAIL per line, never a password. Exit code 1 if any line fails.
set -u
export MSYS_NO_PATHCONV=1   # Git Bash must not rewrite /paths inside docker arguments

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT=kawalys-pilot
HTTP_PORT="${KAWALYS_HTTP_PORT:-18080}"
HTTPS_PORT="${KAWALYS_HTTPS_PORT:-18443}"
BASE="https://localhost:${HTTPS_PORT}"

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
KAWALYS_HTTP_PORT=${HTTP_PORT}
KAWALYS_HTTPS_PORT=${HTTPS_PORT}
POSTGRES_PASSWORD=${PW_ADMIN}
KAWALYS_ROLE_PASSWORD_MIGRATOR=${PW_MIG}
KAWALYS_ROLE_PASSWORD_APP=${PW_APP}
KAWALYS_ROLE_PASSWORD_AUTH=${PW_AUTH}
ENV

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE_NATIVE" --env-file "$ENVF" "$@"; }

cleanup() {
  dc --profile ops down -v --remove-orphans >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

FAILS=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }
check() { local name="$1"; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }

code() { curl -sk -o "$TMP_NATIVE/body" -w '%{http_code}' --max-time 10 "$@" 2>/dev/null; }
is_code() { [ "$(code "$2")" = "$1" ]; }

log() { echo "-- $*"; }
quiet() { "$@" >"$TMP/step.log" 2>&1 || { echo "step failed: $*"; tail -n 40 "$TMP/step.log"; return 1; }; }

command -v docker >/dev/null && command -v curl >/dev/null || { echo "FAIL  docker and curl are required"; exit 1; }
[ -f "$HERE/compose.yml" ] || { echo "FAIL  deploy/pilot/compose.yml is missing"; exit 1; }

log "build images and start postgres"
quiet dc build || { fail "images build"; exit 1; }
pass "images build"
quiet dc up -d --wait postgres || { fail "postgres healthy"; exit 1; }
pass "postgres healthy"

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
    while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$secs" ]; do sleep 1; waited=$((waited + 1)); done
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
for _ in $(seq 1 20); do [ "$(code "$BASE/api/process")" = 200 ] && break; sleep 1; done

check "GET /api/process -> 200 (liveness through Caddy)" is_code 200 "$BASE/api/process"
check "GET /api/health -> 200 after migrate" is_code 200 "$BASE/api/health"
check "GET /api/health body is ready:true" grep -q '"ready":true' "$TMP/body"
check "GET / serves the app (HTML with the app root)" bash -c "curl -sk --max-time 10 '$BASE/' | grep -q 'id=\"root\"'"
check "GET /some/spa/route falls back to index.html" bash -c "curl -sk --max-time 10 '$BASE/investigations/x' | grep -q 'id=\"root\"'"
check "GET /api/portfolio -> 404 (deny-all, Descope unset)" is_code 404 "$BASE/api/portfolio"
check "GET /api/portfolio body is not_found" grep -q 'not_found' "$TMP/body"
check_headers() { # $1 label, $2 url
  local h; h="$(curl -skI --max-time 10 "$2")"
  check "security header on $1: Strict-Transport-Security" bash -c 'echo "$0" | grep -qi "^strict-transport-security:"' "$h"
  check "security header on $1: X-Content-Type-Options nosniff" bash -c 'echo "$0" | grep -qi "^x-content-type-options: nosniff"' "$h"
  check "security header on $1: Referrer-Policy no-referrer" bash -c 'echo "$0" | grep -qi "^referrer-policy: no-referrer"' "$h"
  check "security header on $1: X-Frame-Options DENY" bash -c 'echo "$0" | grep -qi "^x-frame-options: deny"' "$h"
}
check_headers "/" "$BASE/"
check_headers "/api/process" "$BASE/api/process"
published() { docker ps --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$1" --format '{{.Ports}}' | grep -c -- '->'; }
check "bff publishes no host port (docker compose port bff 8787 empty)" bash -c '[ -z "$(docker compose -p kawalys-pilot -f "$0" --env-file "$1" port bff 8787 2>/dev/null | grep -v "^:0$")" ]' "$COMPOSE_FILE_NATIVE" "$ENVF"
check "bff has no host port mapping in docker ps" test "$(published bff)" = 0
check "postgres publishes no host port (docker compose port postgres 5432 empty)" bash -c '[ -z "$(docker compose -p kawalys-pilot -f "$0" --env-file "$1" port postgres 5432 2>/dev/null | grep -v "^:0$")" ]' "$COMPOSE_FILE_NATIVE" "$ENVF"
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
check "web: CapAdd only NET_BIND_SERVICE" test "$(insp '{{json .HostConfig.CapAdd}}' "$WEB_ID")" = '["CAP_NET_BIND_SERVICE"]'
check "web: no-new-privileges" bash -c 'echo "$0" | grep -q no-new-privileges' "$(insp '{{json .HostConfig.SecurityOpt}}' "$WEB_ID")"
check "web: read-only root filesystem" test "$(insp '{{.HostConfig.ReadonlyRootfs}}' "$WEB_ID")" = true
check "web: effective capabilities are only NET_BIND_SERVICE" bash -c 'docker exec "$0" grep -q "^CapEff:.*0000000000000400$" /proc/1/status' "$WEB_ID"
check "bff: CapDrop ALL and no-new-privileges" bash -c 'echo "$0" | grep -q ALL && echo "$1" | grep -q no-new-privileges' "$(insp '{{json .HostConfig.CapDrop}}' "$BFF_ID")" "$(insp '{{json .HostConfig.SecurityOpt}}' "$BFF_ID")"
check "bff: effective capabilities are empty" bash -c 'docker exec "$0" grep -q "^CapEff:.*0000000000000000$" /proc/1/status' "$BFF_ID"

check "CA private key is not in the pg-tls volume seen by bff" bash -c '! docker exec "$0" ls /pki | grep -q "ca.key"' "$BFF_ID"
check "bff sees ca.crt, server.crt, server.key only" test "$(docker exec "$BFF_ID" ls /pki | tr -d "" | sort | tr "
" " ")" = "ca.crt server.crt server.key "

log "sign-in limit is per client behind Caddy (forged X-Forwarded-For does not bypass it)"
LIMITED=no
for i in $(seq 1 14); do
  [ "$(code -X POST -H "X-Forwarded-For: 203.0.113.$i" "$BASE/api/auth/session")" = 429 ] && { LIMITED=yes; break; }
done
check "14 sign-in attempts with 14 forged X-Forwarded-For values hit 429" test "$LIMITED" = yes

log "database outage: unknown is never healthy"
dc stop postgres >/dev/null 2>&1
saw503=no
for _ in $(seq 1 10); do [ "$(code "$BASE/api/health")" = 503 ] && { saw503=yes; break; }; sleep 1; done
check "postgres stopped -> /api/health 503 within 10 s" test "$saw503" = yes
check "liveness stays 200 while the database is down" is_code 200 "$BASE/api/process"
dc start postgres >/dev/null 2>&1
back=no
for _ in $(seq 1 30); do [ "$(code "$BASE/api/health")" = 200 ] && { back=yes; break; }; sleep 1; done
check "postgres restarted -> /api/health 200 again" test "$back" = yes

echo
if [ "$FAILS" -eq 0 ]; then echo "SMOKE RESULT: ALL PASS"; else echo "SMOKE RESULT: $FAILS FAILED"; fi
[ "$FAILS" -eq 0 ]
