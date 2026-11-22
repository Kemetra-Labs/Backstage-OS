#!/usr/bin/env bash
# BACK-80 helper: read-only build-provenance checks for CodeGraph 1.6.4 bundles.
# Nothing from CodeGraph is installed or executed: packages are fetched with
# `npm pack` (no install, no scripts), unpacked with tar and inspected with
# sha*sum, strings, readelf and objdump.
# usage: provenance_check.sh <empty-work-dir> <codegraph-clone-at-v1.6.4>
set -euo pipefail
W="$1"; SRC="$2"; mkdir -p "$W"; cd "$W"
TAG_SHA=461a5d87a873a4932997cd9a49042ab30e45a675
echo "== tag";   git -C "$SRC" rev-parse 'v1.6.4^{commit}'
for p in codegraph codegraph-linux-x64 codegraph-win32-x64; do
  mkdir -p "$p" && (cd "$p" && npm pack "@colbymchenry/$p@1.6.4" --ignore-scripts --silent >/dev/null && mkdir -p x && tar -xzf ./*.tgz -C x)
  curl -s "https://registry.npmjs.org/-/npm/v1/attestations/@colbymchenry%2f$p@1.6.4" > "$p.att.json"
  jq -r '.attestations[]|select(.predicateType|test("slsa"))|.bundle.dsseEnvelope.payload' "$p.att.json" | base64 -d > "$p.slsa.json"
  want=$(jq -r '.subject[0].digest.sha512' "$p.slsa.json"); have=$(sha512sum "$p"/*.tgz | cut -d' ' -f1)
  echo "== $p tarball sha512 == attested subject: $([ "$want" = "$have" ] && echo YES || echo NO)"
  jq -c '{commit:.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit, workflow:.predicate.buildDefinition.externalParameters.workflow.path, run:.predicate.runDetails.metadata.invocationId}' "$p.slsa.json"
  echo "   npm gitHead: $(curl -s "https://registry.npmjs.org/@colbymchenry%2f$p/1.6.4" | jq -r .gitHead)"
done
BUILT=$(jq -r '.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit' codegraph-linux-x64.slsa.json)
git -C "$SRC" fetch -q --depth 5 origin "$BUILT" || true
echo "== diff provenance commit $BUILT -> tag $TAG_SHA:"; git -C "$SRC" diff --stat "$BUILT" "$TAG_SHA"
git -C "$SRC" diff --quiet "$BUILT" "$TAG_SHA" -- codegraph-kernel src/extraction/wasm scripts && echo "   kernel/, vendored wasm, scripts/ identical"
echo "== crate versions embedded in kernels (panic-location paths) vs Cargo.lock"
for k in codegraph-linux-x64/x/package/lib/kernel/codegraph-kernel.node codegraph-win32-x64/x/package/lib/kernel/codegraph-kernel.node; do
  { strings -n 8 "$k"; strings -el -n 8 "$k"; } | grep -o -E 'index\.crates\.io-[0-9a-f]+[/\\][A-Za-z0-9_.-]+' | sed -E 's#.*[/\\]##' | sort -u | while read -r cv; do
    n=${cv%-*}; v=${cv##*-}
    grep -A1 -x "name = \"$n\"" "$SRC/codegraph-kernel/Cargo.lock" | grep -q "version = \"$v\"" && echo "   $k: $cv in Cargo.lock" || echo "   $k: $cv NOT IN Cargo.lock"
  done
  { strings -n 8 "$k"; } | grep -o -E '/rustc/[0-9a-f]{40}|rustc version [^)]*\)' | sort -u | sed 's/^/   /'
done
echo "== vendored Node vs nodejs.org v24.22.1"
curl -fsSO https://nodejs.org/dist/v24.22.1/SHASUMS256.txt
curl -fsSO https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz
curl -fsSO https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip
grep -E 'linux-x64.tar.xz$|win-x64.zip$' SHASUMS256.txt; sha256sum node-v24.22.1-linux-x64.tar.xz node-v24.22.1-win-x64.zip
tar -xJf node-v24.22.1-linux-x64.tar.xz node-v24.22.1-linux-x64/bin/node
unzip -q -o node-v24.22.1-win-x64.zip node-v24.22.1-win-x64/node.exe
sha256sum node-v24.22.1-linux-x64/bin/node codegraph-linux-x64/x/package/node node-v24.22.1-win-x64/node.exe codegraph-win32-x64/x/package/node.exe
echo "== licence files shipped"; find codegraph*/x/package -maxdepth 3 -iname 'licen*' -not -path '*/node_modules/*' | sed 's/^/   /'; echo "   (end)"
