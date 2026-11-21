#!/usr/bin/env bash
# Runs `npm ci --ignore-scripts` in the current directory, with a fallback npm cache.
# CircleCI's Actions runner can leave root-owned files in ~/.npm, and npm then stops with
# EACCES before any test runs. When any path in the default cache is not writable by this
# user, a private cache under the runner temp dir is used instead. GitHub-hosted runners
# have a writable ~/.npm, so they keep the default cache that setup-node saves and restores.
# Usage: npm-ci.sh   (run it from the directory that holds package-lock.json)
set -euo pipefail

CACHE="$(npm config get cache)"

if [[ -e "$CACHE" && -n "$(find "$CACHE" ! -writable -print -quit 2>/dev/null)" ]]; then
  FALLBACK="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/npm-cache"
  echo "npm cache $CACHE holds files this user cannot write; using $FALLBACK" >&2
  exec npm ci --ignore-scripts --cache "$FALLBACK"
fi

exec npm ci --ignore-scripts
