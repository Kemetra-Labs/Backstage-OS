#!/usr/bin/env bash
# Tests for ci-gate.sh (BACK-93): feed it a synthetic `needs` context and check pass or fail.
# Usage: bash .github/scripts/test-ci-gate.sh   (exit 0 = all cases pass)
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/ci-gate.sh"
PASS=0
FAIL=0

# needs_json <root> <app> <server> <g1> <classify-result> then job=result[:ran] pairs.
# A job given as "name=success" reports ran=true; "name=success:noran" reports no ran output.
needs_json() {
  local root="$1" app="$2" server="$3" g1="$4" cres="$5"; shift 5
  local jobs="" pair name rest result ran
  for pair in "$@"; do
    name="${pair%%=*}"; rest="${pair#*=}"; result="${rest%%:*}"
    if [[ "$rest" == *":noran" || "$result" != "success" ]]; then ran='{}'; else ran='{"ran":"true"}'; fi
    jobs="$jobs,\"$name\":{\"result\":\"$result\",\"outputs\":$ran}"
  done
  printf '{"classify":{"result":"%s","outputs":{"root":"%s","app":"%s","server":"%s","g1":"%s","mode":"x","reason":"x"}}%s}' \
    "$cres" "$root" "$app" "$server" "$g1" "$jobs"
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

ALL_OK=(root=success app-check=success app-e2e-v1=success app-e2e-v2=success server=success g1=success)
SERVER_ONLY=(root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=success g1=skipped)
NONE=(root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=skipped g1=skipped)

check "full run, all green" pass "$(needs_json true true true true success "${ALL_OK[@]}")"
check "server-only, server green" pass "$(needs_json false false true false success "${SERVER_ONLY[@]}")"
check "docs-only, everything skipped" pass "$(needs_json false false false false success "${NONE[@]}")"

check "required job failed" fail "$(needs_json false false true false success \
  root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=failure g1=skipped)"
check "required job cancelled" fail "$(needs_json false false true false success \
  root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=cancelled g1=skipped)"
check "required job unexpectedly skipped" fail "$(needs_json false true false false success \
  root=skipped app-check=success app-e2e-v1=skipped app-e2e-v2=success server=skipped g1=skipped)"
check "required job succeeded without running its steps" fail "$(needs_json false false true false success \
  root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=success:noran g1=skipped)"
check "job ran although not selected" fail "$(needs_json false false true false success \
  root=success app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped server=success g1=skipped)"
check "classifier failed" fail "$(needs_json false false false false failure "${NONE[@]}")"
check "classifier cancelled" fail "$(needs_json true true true true cancelled "${NONE[@]}")"
check "a required job is missing from needs" fail "$(needs_json false false true false success \
  root=skipped app-check=skipped app-e2e-v1=skipped app-e2e-v2=skipped g1=skipped)"
check "flag is neither true nor false" fail "$(needs_json false false yes false success "${SERVER_ONLY[@]}")"
check "empty needs" fail ""
check "malformed needs" fail "{not json"

echo "ci-gate: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
