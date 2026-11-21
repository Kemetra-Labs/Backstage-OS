#!/usr/bin/env bash
# Prints "docs_only=true" when every changed file is documentation, else "docs_only=false".
# Usage: docs-only.sh <base-sha> <head-ref>
# Docs = any *.md file, anything under docs/, or .github/scripts/g1-scorer-changed.sh. Anything unknown or unreadable
# falls back to "false" so the full suite runs (fail safe, never fail open).
set -uo pipefail

BASE="${1:-}"
HEAD="${2:-HEAD}"

if [[ -z "$BASE" || "$BASE" =~ ^0+$ ]]; then
  echo "docs_only=false"; exit 0
fi

if ! CHANGED=$(git diff --name-only "$BASE" "$HEAD" 2>/dev/null); then
  echo "docs_only=false"; exit 0
fi

if [[ -z "$CHANGED" ]]; then
  echo "docs_only=false"; exit 0
fi

# g1-scorer-changed.sh only decides whether the G1 scorer self-check runs (a few seconds of stdlib Python).
# Editing it alone cannot affect the browser suites, so it counts as docs here. Any other .github/ file,
# including workflows/ci.yml itself, still runs the full suite.
NON_DOCS=$(printf '%s\n' "$CHANGED" | grep -vE '(\.md$|^docs/|^\.github/scripts/g1-scorer-changed\.sh$)' || true)

echo "Changed files:" >&2
printf '  %s\n' $CHANGED >&2

if [[ -z "$NON_DOCS" ]]; then
  echo "docs_only=true"
else
  echo "docs_only=false"
fi
