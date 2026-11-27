#!/usr/bin/env bash
# Deterministic tests for classify-changes.sh (BACK-93). Each case builds a throwaway git repo, makes one change,
# runs the classifier against it and compares the suites it selects with the expected set.
# Usage: bash .github/scripts/test-classify-changes.sh   (exit 0 = all cases pass)
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLASSIFIER="$HERE/classify-changes.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0
FAIL=0

# A small tree with one file in every area the classifier knows about.
seed_repo() {
  local dir="$1"
  rm -rf "$dir" && mkdir -p "$dir" && cd "$dir" || exit 1
  git init -q -b main
  git config user.email ci@example.invalid
  git config user.name ci
  git config commit.gpgsign false
  git config core.autocrlf false
  mkdir -p server/src server/migrations app/src app/e2e js css tests docs/qa docs/design-lab \
    docs/planning/G1/fixture docs/planning/G1/holdout-v1 .github/workflows .github/scripts .claude/skills tests-bstack
  for f in server/src/main.ts server/migrations/0001.sql server/package.json server/README.md \
    app/src/main.tsx app/e2e/a.spec.ts app/package.json app/vite.config.ts \
    index.html js/app.js css/app.css tests/smoke.spec.js playwright.config.js package.json package-lock.json \
    docs/qa/report.md docs/qa/shot.png docs/design-lab/tool.py docs/design-lab/page.html \
    docs/planning/G1/fixture/score.py docs/planning/G1/holdout-v1/verify.py \
    .github/workflows/ci.yml .github/scripts/npm-ci.sh .claude/skills/x.md tests-bstack/smoke.spec.js \
    README.md LICENSE; do
    echo seed > "$f"
  done
  git add -A && git commit -qm base
  BASE_SHA="$(git rev-parse HEAD)"
}

# Prints the selected suites in a fixed order, e.g. "root app" or "none".
selected() {
  local out="$1" s=""
  for k in root app app_e2e live_e2e server g1; do
    grep -qx "$k=true" <<<"$out" && s="$s $k"
  done
  s="${s# }"
  echo "${s:-none}"
}

# check <name> <expected suites> <expected mode> <event> <base> -- runs the classifier on HEAD.
check() {
  local name="$1" want="$2" want_mode="$3" event="$4" base="$5" out got mode
  out="$(bash "$CLASSIFIER" "$event" "$base" HEAD 2>/dev/null)"
  got="$(selected "$out")"
  mode="$(sed -n 's/^mode=//p' <<<"$out")"
  if [[ "$got" == "$want" && "$mode" == "$want_mode" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $name: want [$want/$want_mode] got [$got/$mode]" >&2
    printf '  %s\n' "$out" >&2
  fi
}

commit_change() { git add -A && git commit -qm change; }
case_with() { seed_repo "$WORK/r"; "$@"; commit_change; }

ALL="root app app_e2e live_e2e server g1"
# Any app/ or server/ code change also runs the live end-to-end suite (`live_e2e`, BACK-51 P4: app/e2e-live against the real BFF).
# Any app/ change runs the app typecheck and unit tests (`app`) and the one app browser suite (`app_e2e`, app/e2e). The standalone
# lens suite and its flag (app_v2) retired with its entry (BACK-92 R4).
APP_ALL="app app_e2e live_e2e"

# Backend-only, like PR #79 (server plus documentation).
case_with bash -c 'echo x >> server/src/main.ts; echo x >> server/migrations/0001.sql; echo x >> docs/qa/report.md'
check "backend-only (PR #79 shape)" "live_e2e server" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> js/app.js'
check "root prototype only" "root" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> tests/smoke.spec.js; echo x >> playwright.config.js'
check "root tests and config" "root" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> app/src/main.tsx'
check "app source" "$APP_ALL" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> app/e2e/a.spec.ts'
check "host spec only" "$APP_ALL" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x > app/playwright.config.ts'
check "host Playwright config" "$APP_ALL" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x > app/index.html'
check "host entry page" "$APP_ALL" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> app/vite.config.ts'
check "host vite config" "$APP_ALL" selective pull_request "$BASE_SHA"

# BACK-92 R4: the lab's paths are gone. Re-adding one is an ordinary app/ change: it runs the app suites, never a retired job.
case_with bash -c 'mkdir -p app/e2e-v2 && echo x > app/e2e-v2/b.spec.ts; echo x > app/playwright.v2.config.ts; echo x > app/vite.v2.config.ts; echo x > app/v2.html'
check "retired lab paths re-added: app suites, no lab flag" "$APP_ALL" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> app/src/main.tsx'
out="$(bash "$CLASSIFIER" pull_request "$BASE_SHA" HEAD 2>/dev/null)"
if grep -q '^app_v2=' <<<"$out"; then FAIL=$((FAIL + 1)); echo "FAIL: the retired app_v2 flag is still printed" >&2; else PASS=$((PASS + 1)); fi

# The server parity specs read the server-built response fixtures in app/src/fixture, so a change to one selects server too.
case_with bash -c 'mkdir -p app/src/fixture && echo x >> app/src/fixture/evidence-response.json'
check "server-built parity fixture" "$APP_ALL server" selective pull_request "$BASE_SHA"

case_with bash -c 'mkdir -p app/src/fixture && echo x >> app/src/fixture/world.ts'
check "other app fixture file: no server" "$APP_ALL" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x > app/tsconfig.json'
check "other app file (shared config)" "$APP_ALL" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> app/src/main.tsx; echo x >> server/src/main.ts'
check "mixed app and server" "$APP_ALL server" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> docs/qa/report.md; echo x >> README.md; echo x >> docs/qa/shot.png'
check "docs only" "none" docs pull_request "$BASE_SHA"

case_with bash -c 'mkdir -p app/src/fonts && echo x > app/src/fonts/SOURCE.md'
check "markdown inside app/ (unit tests read some of it)" "$APP_ALL" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> server/README.md'
check "markdown inside server/" "none" docs pull_request "$BASE_SHA"

case_with bash -c 'echo x >> docs/design-lab/tool.py'
check "executable file under docs/" "$ALL" full pull_request "$BASE_SHA"

case_with bash -c 'echo x >> docs/design-lab/page.html'
check "html under docs/" "$ALL" full pull_request "$BASE_SHA"

case_with bash -c 'echo x >> docs/planning/G1/fixture/score.py'
check "G1 scorer" "g1" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> docs/planning/G1/holdout-v1/verify.py'
check "G1 hold-out verifier" "g1" selective pull_request "$BASE_SHA"

case_with bash -c 'git mv app/src/main.tsx server/src/moved.tsx'
check "rename across areas counts both paths" "$APP_ALL server" selective pull_request "$BASE_SHA"

case_with bash -c 'git rm -q server/migrations/0001.sql'
check "deleted file" "live_e2e server" selective pull_request "$BASE_SHA"

case_with bash -c 'git rm -q js/app.js'
check "deleted root file" "root" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> .github/workflows/ci.yml'
check "workflow change" "$ALL" full pull_request "$BASE_SHA"

case_with bash -c 'echo x >> .github/scripts/npm-ci.sh'
check "shared CI script" "$ALL" full pull_request "$BASE_SHA"

# Root manifests belong to the root prototype only: app/ declares its own dependencies (including @types/node), so a root
# dependency change cannot affect the app suites (BACK-93; BACK-92 plan R2).
case_with bash -c 'echo x >> package-lock.json'
check "root lockfile" "root" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> package.json'
check "root package manifest" "root" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> app/package.json'
check "app package manifest" "$APP_ALL" selective pull_request "$BASE_SHA"

case_with bash -c 'echo x >> LICENSE'
check "unknown root file" "$ALL" full pull_request "$BASE_SHA"

case_with bash -c 'echo x >> .claude/skills/x.md'
check "markdown under .claude/" "none" docs pull_request "$BASE_SHA"

case_with bash -c 'echo x > .claude/skills/run.sh'
check "script under .claude/" "$ALL" full pull_request "$BASE_SHA"

case_with bash -c 'mkdir -p newdir && echo x > newdir/thing.ts'
check "new unknown directory" "$ALL" full pull_request "$BASE_SHA"

case_with bash -c 'echo x >> server/src/main.ts'
check "push event diffs against before" "live_e2e server" selective push "$BASE_SHA"
check "invalid base sha" "$ALL" full pull_request "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
check "missing base" "$ALL" full pull_request ""
check "all-zero base (new branch push)" "$ALL" full push "0000000000000000000000000000000000000000"
check "manual run" "$ALL" full workflow_dispatch "$BASE_SHA"
check "scheduled run" "$ALL" full schedule "$BASE_SHA"
check "unknown event" "$ALL" full merge_group "$BASE_SHA"

seed_repo "$WORK/r"
check "empty diff" "$ALL" full pull_request "$BASE_SHA"

echo "classify-changes: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
