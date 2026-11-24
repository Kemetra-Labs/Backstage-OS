#!/usr/bin/env bash
# Decides which CI suites a change needs (BACK-93). Prints GITHUB_OUTPUT lines:
#   root=, app=, server=, g1= (true|false), mode= (selective|docs|full), reason=
# Usage: classify-changes.sh <event-name> <base-sha> <head-ref>
#
# Fail safe, never fail open: a manual, scheduled or unknown event, a missing, all-zero or unreadable base, an empty diff,
# any .github/ change and any path not in the table below select every suite (mode=full).
# Renames are split into a deletion and an addition (--no-renames), so both the old and the new path count.
# Tests: .github/scripts/test-classify-changes.sh. The impact matrix is recorded in the BACK-93 PR.
set -uo pipefail

EVENT="${1:-}"
BASE="${2:-}"
HEAD="${3:-HEAD}"

ROOT=false APP=false SERVER=false G1=false

full() {
  echo "root=true"; echo "app=true"; echo "server=true"; echo "g1=true"
  echo "mode=full"; echo "reason=$1"
  exit 0
}

case "$EVENT" in
  pull_request|push) ;;
  *) full "event '$EVENT' always runs every suite" ;;
esac

if [[ -z "$BASE" || "$BASE" =~ ^0+$ ]]; then
  full "no usable base commit"
fi

if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  full "base $BASE is not a commit in this checkout"
fi

if ! CHANGED=$(git diff --no-renames --name-only "$BASE" "$HEAD" 2>/dev/null); then
  full "git diff failed"
fi

if [[ -z "$CHANGED" ]]; then
  full "empty diff"
fi

echo "Changed files:" >&2
printf '  %s\n' "$CHANGED" >&2

# Files under docs/ that no suite executes or serves. Anything else under docs/ (scripts, HTML, JSON, CSS, ...)
# is treated as unknown, because a file is not harmless just because it lives under docs/.
INERT_DOCS='\.(png|jpe?g|gif|webp|txt|csv|pdf|woff2)$'

while IFS= read -r path; do
  case "$path" in
    .github/*) full ".github/ changed: $path" ;;
    docs/planning/G1/fixture/*|docs/planning/G1/holdout-v1/*) G1=true ;;
    # app/ before *.md: app unit tests assert on markdown inside app/ (e.g. the V2 font SOURCE.md pins).
    app/*) APP=true ;;
    *.md) ;;
    server/*) SERVER=true ;;
    index.html|js/*|css/*|tests/*|playwright.config.js|package.json|package-lock.json) ROOT=true ;;
    tests-bstack/*|playwright.bstack.config.js|browserstack.yml) ROOT=true ;;
    docs/*)
      if [[ ! "$path" =~ $INERT_DOCS ]]; then
        full "possibly executable file under docs/: $path"
      fi
      ;;
    *) full "unclassified path: $path" ;;
  esac
done <<<"$CHANGED"

echo "root=$ROOT"; echo "app=$APP"; echo "server=$SERVER"; echo "g1=$G1"
if [[ "$ROOT$APP$SERVER$G1" == "falsefalsefalsefalse" ]]; then
  echo "mode=docs"; echo "reason=documentation only"
else
  echo "mode=selective"; echo "reason=selected from changed paths"
fi
