#!/usr/bin/env bash
# Prints "docs_only=true" when every changed file is documentation, else "docs_only=false".
# Usage: docs-only.sh <base-sha> <head-ref>
# Docs = any *.md file or anything under docs/. Anything unknown or unreadable
# falls back to "false" so the full suite runs (fail safe, never fail open).
set -uo pipefail

BASE="${1:-}"
HEAD="${2:-HEAD}"

if [ -z "$BASE" ] || echo "$BASE" | grep -qE '^0+$'; then
  echo "docs_only=false"; exit 0
fi

if ! CHANGED=$(git diff --name-only "$BASE" "$HEAD" 2>/dev/null); then
  echo "docs_only=false"; exit 0
fi

if [ -z "$CHANGED" ]; then
  echo "docs_only=false"; exit 0
fi

NON_DOCS=$(printf '%s\n' "$CHANGED" | grep -vE '(\.md$|^docs/)' || true)

echo "Changed files:" >&2
printf '  %s\n' $CHANGED >&2

if [ -z "$NON_DOCS" ]; then
  echo "docs_only=true"
else
  echo "docs_only=false"
fi
