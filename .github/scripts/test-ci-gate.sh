#!/usr/bin/env bash
# Tests for ci-gate.sh (BACK-93): feed it a synthetic `needs` context and check pass or fail.
# Usage: bash .github/scripts/test-ci-gate.sh   (exit 0 = all cases pass)
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/ci-gate.sh"
PASS=0
FAIL=0

# needs_json "<root> <app> <app_e2e> <live_e2e> <server> <g1>" <classify-result> then job=result[:ran] pairs.
# A job given as "name=success" reports ran=true; "name=success:noran" reports no ran output.
needs_json() {
  local flags cres; read -r -a flags <<<"$1"; cres="$2"; shift 2
  local jobs="" pair name rest result ran
  for pair in "$@"; do
    name="${pair%%=*}"; rest="${pair#*=}"; result="${rest%%:*}"
    if [[ "$rest" == *":noran" || "$result" != "success" ]]; then ran='{}'; else ran='{"ran":"true"}'; fi
    jobs="$jobs,\"$name\":{\"result\":\"$result\",\"outputs\":$ran}"
  done
  printf '{"classify":{"result":"%s","outputs":{"root":"%s","app":"%s","app_e2e":"%s","live_e2e":"%s","server":"%s","g1":"%s","mode":"x","reason":"x"}}%s}' \
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

#        root  app   app_e2e live_e2e server g1
FULL='   true  true  true   true     true   true'
SRV='    false false false  true     true   false'
NONEF='  false false false  false    false  false'
APP='    false true  true   true     false  false'

ALL_OK=(root=success app-check=success app-e2e=success live-e2e=success server=success g1=success)
SERVER_ONLY=(root=skipped app-check=skipped app-e2e=skipped live-e2e=success server=success g1=skipped)
NONE=(root=skipped app-check=skipped app-e2e=skipped live-e2e=skipped server=skipped g1=skipped)

check "full run, all green" pass "$(needs_json "$FULL" success "${ALL_OK[@]}")"
check "server-only, server green" pass "$(needs_json "$SRV" success "${SERVER_ONLY[@]}")"
check "docs-only, everything skipped" pass "$(needs_json "$NONEF" success "${NONE[@]}")"

# Any app/ change runs the check and the app browser suite (app-e2e); the standalone lens job retired with its entry (BACK-92 R4).
check "app change: check + app e2e green" pass "$(needs_json "$APP" success \
  root=skipped app-check=success app-e2e=success live-e2e=success server=skipped g1=skipped)"
check "app change, but app e2e skipped" fail "$(needs_json "$APP" success \
  root=skipped app-check=success app-e2e=skipped live-e2e=success server=skipped g1=skipped)"
check "app change, but the check skipped" fail "$(needs_json "$APP" success \
  root=skipped app-check=skipped app-e2e=success live-e2e=success server=skipped g1=skipped)"
# The gate no longer knows the retired job: a stale app-e2e-v2 entry in needs is ignored, neither required nor a failure.
check "a stale app-e2e-v2 result in needs is ignored" pass "$(needs_json "$APP" success \
  root=skipped app-check=success app-e2e=success live-e2e=success server=skipped g1=skipped app-e2e-v2=skipped)"

check "required job failed" fail "$(needs_json "$SRV" success \
  root=skipped app-check=skipped app-e2e=skipped live-e2e=success server=failure g1=skipped)"
check "required job cancelled" fail "$(needs_json "$SRV" success \
  root=skipped app-check=skipped app-e2e=skipped live-e2e=success server=cancelled g1=skipped)"
check "required job unexpectedly skipped" fail "$(needs_json "$APP" success \
  root=skipped app-check=success app-e2e=skipped live-e2e=success server=skipped g1=skipped)"
check "required job succeeded without running its steps" fail "$(needs_json "$SRV" success \
  root=skipped app-check=skipped app-e2e=skipped live-e2e=success server=success:noran g1=skipped)"
check "job ran although not selected" fail "$(needs_json "$SRV" success \
  root=success app-check=skipped app-e2e=skipped live-e2e=success server=success g1=skipped)"
check "classifier failed" fail "$(needs_json "$NONEF" failure "${NONE[@]}")"
check "classifier cancelled" fail "$(needs_json "$FULL" cancelled "${NONE[@]}")"
check "a required job is missing from needs" fail "$(needs_json "$SRV" success \
  root=skipped app-check=skipped app-e2e=skipped live-e2e=success g1=skipped)"
check "flag is neither true nor false" fail "$(needs_json 'false false false false yes false' success "${SERVER_ONLY[@]}")"
check "a split flag is missing (old classifier)" fail "$(needs_json 'false true  true  true  false false' success \
  root=skipped app-check=success app-e2e=success live-e2e=success server=skipped g1=skipped | sed 's/"app_e2e":"true",//')"
# BACK-51 P4: the live end-to-end suite is a selected job like any other.
check "live e2e selected but skipped" fail "$(needs_json "$SRV" success   root=skipped app-check=skipped app-e2e=skipped live-e2e=skipped server=success g1=skipped)"
check "live e2e selected but failed" fail "$(needs_json "$SRV" success   root=skipped app-check=skipped app-e2e=skipped live-e2e=failure server=success g1=skipped)"
check "live e2e selected but cancelled" fail "$(needs_json "$SRV" success   root=skipped app-check=skipped app-e2e=skipped live-e2e=cancelled server=success g1=skipped)"
check "live e2e succeeded without running its steps" fail "$(needs_json "$SRV" success   root=skipped app-check=skipped app-e2e=skipped live-e2e=success:noran server=success g1=skipped)"
check "live e2e ran although not selected" fail "$(needs_json "$NONEF" success   root=skipped app-check=skipped app-e2e=skipped live-e2e=success server=skipped g1=skipped)"
check "live e2e missing from needs" fail "$(needs_json "$SRV" success   root=skipped app-check=skipped app-e2e=skipped server=success g1=skipped)"
check "classifier did not report live_e2e (old classifier)" fail "$(needs_json "$SRV" success "${SERVER_ONLY[@]}" | sed 's/"live_e2e":"true",//')"
check "empty needs" fail ""
check "malformed needs" fail "{not json"

echo "ci-gate: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
