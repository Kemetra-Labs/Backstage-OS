#!/bin/sh
# Run an Archify CLI command with a fake HOME, update check disabled (no network), from the work dir.
W="$HOME/kawalys-g1-sandbox/renderers/vendor"
FH=$(cygpath -w "$W/fakehome"); FT=$(cygpath -w "$W/faketmp")
cd "$W/archify-work" && USERPROFILE="$FH" HOME="$FH" APPDATA="$FH" LOCALAPPDATA="$FH" TEMP="$FT" TMP="$FT" ARCHIFY_UPDATE_CHECK_DISABLED=1 node ../archify/archify/bin/archify.mjs "$@"
