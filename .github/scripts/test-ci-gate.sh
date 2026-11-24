#!/usr/bin/env bash
# Tests for ci-gate.sh (BACK-93): feed it a synthetic `needs` context and check pass or fail.
# Usage: bash .github/scripts/test-ci-gate.sh   (exit 0 = all cases pass)
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/ci-gate.sh"
PASS=0
FAIL=0

# needs_json "<root> <app> <app_v1> <app_v2> <server> <g1>" <classify-result> then job=result[:ran] pairs.
# A job given as "name=success" reports ran=true; "name=success:noran" reports no ran output.
needs_json() {
  local flags cres; read -r -a flags <<<"$1"; cres="$2"; shift 2
  local jobs="" pair name rest result ran
  for pair in "$@"; do
    name="${pair%%=*}"; rest="${pair#*=}"; result="${rest%%:*}"
    if [[ "$rest" == *":noran" || "$result" != "success" ]]; then ran='{}'; else ran='{"ran":"true"}'; fi
    jobs="$jobs,\"$name\":{\"result\":\"$result\",\"outputs\":$ran}"
  done
  printf '{"classify":{"result":"%s","outputs":{"root":"%s","app":"%s","app_v1":"%s","app_v2":"%s","server":"%s","g1":"%s","mode":"x","reason":"x"}}%s}' \
    "$cres" "${flags[0]}" "${flags[1]}" "${flags[2]}" "${flags[3]}" "${flags[4]}" "${flags[5]}" "$jobs"
}

check() {
  local name="$1" want="$2" json="$3" got
  if NEEDS="$json" bash "$GATE" >/dev/null 2>&1; then got=pass; else got=fail; fi
  if [[ "$got" == "$want" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1)); echo "FAIL: $name: want $want got $got" >&2
  fi
}

#        root  app   app_v1 app_v2 server g1
FULL='   true  true  true   true   true   true'
SRV='    false false false  false  true   false'
NONEF='  false false false  false  false  false'
APP='    false true  true   true   false  false'
V1ONLY=' false true  true   false  false  false'
V2ONLY=' false true  false  true   false  false'

ALL_OK=(root=success app-check=success app-e2e-v1=success app-e2e-v2=success server=success g1=success)
SERVER_ONLY=(root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=success g1=skipped)
NONE=(root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=skipped g1=skipped)

check "full run, all green" pass "$(needs_json "$FULL" success "${ALL_OK[@]}")"
check "server-only, server green" pass "$(needs_json "$SRV" success "${SERVER_ONLY[@]}")"
check "docs-only, everything skipped" pass "$(needs_json "$NONEF" success "${NONE[@]}")"

# The app split: a host-spec change runs the check and V1 only; a lab-spec change runs the check and V2 only.
check "host specs only: check + V1 green, V2 skipped" pass "$(needs_json "$V1ONLY" success \
  root=skipped app-check=success app-e2e-v1=success app-e2e-v2=skipped server=skipped g1=skipped)"
check "lab specs only: check + V2 green, V1 skipped" pass "$(needs_json "$V2ONLY" success \
  root=skipped app-check=success app-e2e-v1=skipped app-e2e-v2=success server=skipped g1=skipped)"
check "host specs only, but V1 skipped" fail "$(needs_json "$V1ONLY" success \
  root=skipped app-check=success app-e2e-v1=skipped app-e2e-v2=skipped server=skipped g1=skipped)"
check "host specs only, but V2 ran too (wiring drift)" fail "$(needs_json "$V1ONLY" success \
  root=skipped app-check=success app-e2e-v1=success app-e2e-v2=success server=skipped g1=skipped)"
check "app source: V2 skipped although selected" fail "$(needs_json "$APP" success \
  root=skipped app-check=success app-e2e-v1=success app-e2e-v2=skipped server=skipped g1=skipped)"

check "required job failed" fail "$(needs_json "$SRV" success \
  root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=failure g1=skipped)"
check "required job cancelled" fail "$(needs_json "$SRV" success \
  root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=cancelled g1=skipped)"
check "required job unexpectedly skipped" fail "$(needs_json "$APP" success \
  root=skipped app-check=success app-e2e-v1=skipped app-e2e-v2=success server=skipped g1=skipped)"
check "required job succeeded without running its steps" fail "$(needs_json "$SRV" success \
  root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=success:noran g1=skipped)"
check "job ran although not selected" fail "$(needs_json "$SRV" success \
  root=success app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=success g1=skipped)"
check "classifier failed" fail "$(needs_json "$NONEF" failure "${NONE[@]}")"
check "classifier cancelled" fail "$(needs_json "$FULL" cancelled "${NONE[@]}")"
check "a required job is missing from needs" fail "$(needs_json "$SRV" success \
  root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped g1=skipped)"
check "flag is neither true nor false" fail "$(needs_json 'false false false false yes false' success "${SERVER_ONLY[@]}")"
check "a split flag is missing (old classifier)" fail "$(needs_json 'false true  true  true  false false' success \
  root=skipped app-check=success app-e2e-v1=success app-e2e-v2=success server=skipped g1=skipped | sed 's/"app_v2":"true",//')"
check "empty needs" fail ""
check "malformed needs" fail "{not json"

echo "ci-gate: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
