#!/usr/bin/env bash
# Prints "g1_scorer=true" when the G1 scorer, its fixture, schema, ground truth or the hold-out fixture changed, else "g1_scorer=false".
# Usage: g1-scorer-changed.sh <base-sha> <head-ref>
# The scorer is executable Python that lives under docs/, so the docs-only skip never runs it. Its self-check
# needs only the python3 on the runner (stdlib only), so this keeps unrelated docs-only PRs lightweight.
# Anything unknown or unreadable falls back to "true" (fail safe: run the check, never skip it silently).
set -uo pipefail

BASE="${1:-}"
HEAD="${2:-HEAD}"

if [[ -z "$BASE" || "$BASE" =~ ^0+$ ]]; then
  echo "g1_scorer=true"; exit 0
fi

if ! CHANGED=$(git diff --name-only "$BASE" "$HEAD" 2>/dev/null) || [[ -z "$CHANGED" ]]; then
  echo "g1_scorer=true"; exit 0
fi

# fixture/ holds score.py, both schemas, ground truth, the test envelopes and the fixture sources; holdout-v1/ holds the
# frozen hold-out (BACK-29), whose verify.py pins score.py and the v1 schema.
# The script and workflow are included so a change to this wiring is itself exercised.
if printf '%s\n' "$CHANGED" | grep -qE '^(docs/planning/G1/(fixture|holdout-v1)/|\.github/scripts/g1-scorer-changed\.sh$|\.github/workflows/ci\.yml$)'; then
  echo "g1_scorer=true"
else
  echo "g1_scorer=false"
fi
