#!/usr/bin/env bash
# Deploy preflight (BACK-117): usage  bash deploy/pilot/preflight-deploy.sh <env-file>
# Requires KAWALYS_BFF_IMAGE and KAWALYS_WEB_IMAGE in the env file to be digest references
# (name@sha256:<64 hex>), never a mutable tag. The file is parsed with grep/sed, never sourced, and no
# value from it is printed (it may hold secrets). Run it before `docker compose pull` / `up`.
set -u
envfile="${1:-}"
[ -n "$envfile" ] && [ -f "$envfile" ] || { echo "preflight: usage: preflight-deploy.sh <env-file>" >&2; exit 2; }
re='^[a-z0-9./_-]+@sha256:[0-9a-f]{64}$'
bad=0
for var in KAWALYS_BFF_IMAGE KAWALYS_WEB_IMAGE; do
  # last assignment wins, as in an env file; strip CR and optional surrounding quotes
  val="$(grep -E "^${var}=" "$envfile" | tail -n 1 | sed -e "s/^${var}=//" -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/")"
  if ! printf '%s' "$val" | grep -Eq "$re"; then
    echo "preflight: $var is missing or is not a digest reference (expected name@sha256:<64 hex>, no tag)" >&2
    bad=1
  fi
done
[ "$bad" = 0 ] || exit 1
echo "preflight: image references are digest-pinned"
