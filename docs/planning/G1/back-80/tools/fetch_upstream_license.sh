#!/usr/bin/env bash
# BACK-80 helper: fetch an upstream grammar repo's licence file at a pinned ref
# from raw.githubusercontent.com and print its first non-blank lines.
# usage: fetch_upstream_license.sh <owner/repo> <ref> [outdir]
set -u
repo="$1"; ref="$2"; out="${3:-.}"
for f in LICENSE LICENSE.md LICENSE.txt LICENSE-MIT COPYING; do
  dst="$out/$(echo "$repo" | tr / _)@$ref.$f"
  code=$(curl -s -o "$dst" -w '%{http_code}' --max-time 30 "https://raw.githubusercontent.com/$repo/$ref/$f")
  if [ "$code" = 200 ]; then
    printf '%s@%s %s: ' "$repo" "$ref" "$f"; grep -v '^\s*$' "$dst" | head -2 | tr '\n' '|'; echo
    exit 0
  fi
  rm -f "$dst"
done
echo "$repo@$ref: NO LICENSE FILE FOUND"; exit 1
