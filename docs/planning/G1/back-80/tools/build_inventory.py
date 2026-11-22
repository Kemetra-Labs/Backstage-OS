#!/usr/bin/env python3
"""BACK-80 helper: assemble inventory.csv from the evidence the other helpers wrote.

Inputs (all produced read-only; nothing from CodeGraph is executed):
  crates.json        crate_licenses.py over codegraph-kernel/Cargo.lock @ v1.6.4
  linked-linux.txt   `cargo tree --locked -e normal,no-proc-macro --target x86_64-unknown-linux-gnu`
  linked-win.txt     same for x86_64-pc-windows-msvc
  std-crates.json    crate_licenses.py over rust-lang/rust 1.100.0 library/Cargo.lock
  wasm36.json        wasm_grammar_licenses.py over tree-sitter-wasms pnpm-lock.yaml
  node-LICENSE       nodejs/node v24.22.1 LICENSE (raw.githubusercontent.com)

usage: build_inventory.py <crates.json> <linked-linux.txt> <linked-win.txt>
                          <std-crates.json> <wasm36.json> <node-LICENSE> <out.csv>
Run with `python3 -I`.
"""
import csv, json, re, sys

(crates_p, lin_p, win_p, std_p, w36_p, nodelic_p, out_p) = sys.argv[1:8]
rows = []


def add(component, item, version, spdx, status, evidence, obligations):
    rows.append([component, item, version, spdx, status, evidence, obligations])


PERMISSIVE = {
    "MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Zlib", "Unlicense", "0BSD",
    "Unicode-3.0", "CC0-1.0", "BlueOak-1.0.0", "Apache-2.0 WITH LLVM-exception", "MIT-0",
}


def norm(spdx):
    return (spdx or "").replace("MIT/Apache-2.0", "MIT OR Apache-2.0")


def classify(spdx):
    s = norm(spdx)
    if not s:
        return "BLOCKED"
    # an OR-expression is permissive if any alternative is permissive
    for alt in re.split(r"\s+OR\s+", s.strip("()")):
        terms = [t.strip("() ") for t in re.split(r"\s+AND\s+", alt)]
        if all(t in PERMISSIVE for t in terms):
            return "permissive"
    if any(k in s for k in ("MPL", "LGPL", "EPL", "OFL", "Artistic", "CDDL")):
        return "weak-copyleft"
    if "GPL" in s:
        return "copyleft"
    return "unknown"


def mit_or_apache_obl(spdx, linked):
    if not linked:
        return "None for redistribution: build-time/proc-macro only, not linked into the .node"
    s = norm(spdx)
    if "MIT" in s:
        return "Include copyright notice + MIT text (elect MIT where dual-licensed)"
    if "ISC" in s:
        return "Include copyright notice + ISC text"
    return "Include licence text and notices"


# ---- 1. Native kernel: Cargo.lock crates ----
linked = {}
for p, tgt in ((lin_p, "linux-x64"), (win_p, "win32-x64")):
    for line in open(p):
        parts = line.split()
        if len(parts) >= 2:
            linked.setdefault((parts[0], parts[1].lstrip("v")), []).append(tgt)

for c in json.load(open(crates_p)):
    name, ver = c["name"], c["version"]
    if name == "codegraph-kernel":
        add("kernel:crate", name, ver, "MIT", "permissive",
            "codegraph-kernel/Cargo.toml @ v1.6.4 (461a5d8) license=MIT; path crate",
            "Covered by CodeGraph MIT notice")
        continue
    lt = linked.get((name, ver), [])
    spdx = norm(c.get("license"))
    files = ";".join(c.get("licence_files") or []) or "none in .crate"
    ev = (f"static.crates.io .crate sha256 {'==' if c.get('checksum_match') else '!='} Cargo.lock checksum; "
          f"crate Cargo.toml license='{c.get('license')}'; licence files: {files}; "
          f"{'linked: ' + '+'.join(lt) if lt else 'build-time/proc-macro only (cargo tree -e normal,no-proc-macro)'}")
    add("kernel:crate", name, ver, spdx, classify(spdx), ev, mit_or_apache_obl(spdx, bool(lt)))

# ---- 1b. Vendored grammar C compiled into the kernel (build.rs) ----
for g, repo, ref, lic, holder in [
    ("kotlin", "fwcd/tree-sitter-kotlin", "d6af96d2e23e", "MIT", "Copyright (c) 2019 fwcd"),
    ("lua", "tree-sitter-grammars/tree-sitter-lua", "v0.4.1", "MIT", "Copyright (c) 2021 Munif Tanjim"),
    ("scala", "tree-sitter/tree-sitter-scala", "v0.26.2", "MIT", "Copyright (c) 2018 Max Brunsfeld and GitHub"),
    ("dart", "UserNobody14/tree-sitter-dart", "0038280b774b", "MIT", "Copyright (c) 2020-2023 UserNobody14 and others"),
    ("swift", "alex-pinkus/tree-sitter-swift", "0.7.4 crate tarball + CodeGraph scanner patch", "MIT",
     "Copyright (c) 2021 alex-pinkus"),
]:
    gap = ("; GAP: codegraph-kernel/grammars/kotlin ships NO LICENSE file"
           if g == "kotlin" else f"; codegraph-kernel/grammars/{g}/LICENSE present")
    add("kernel:vendored-c", f"tree-sitter-{g} (grammars/{g}/parser.c, scanner.c)", ref, lic, "permissive",
        f"build.rs + Cargo.toml comments name {repo}@{ref}; upstream LICENSE fetched at that ref ({holder}){gap}",
        f"Include '{holder}' + MIT text")

# ---- 1c. Rust standard library statically linked ----
add("kernel:rust-std", "Rust std/core/alloc (rustc 1.100.0, 0ef1bc386)", "1.100.0", "MIT OR Apache-2.0", "permissive",
    "ELF .comment 'rustc version 1.100.0 (0ef1bc386 2026-11-09)'; /rustc/0ef1bc38... paths in both kernels; "
    "rust-lang/rust@1.100.0 COPYRIGHT + library/std/Cargo.toml",
    "Include Rust Project copyright + MIT text")
add("kernel:rust-std", "compiler_builtins (in-tree)", "0.1.160",
    "MIT AND Apache-2.0 WITH LLVM-exception AND (MIT OR Apache-2.0)", "permissive",
    "rust-lang/rust@1.100.0 library/compiler-builtins/compiler-builtins/Cargo.toml",
    "LLVM-exception waives attribution for compiled object form; include MIT text for MIT parts")
std_rows = json.load(open(std_p))
for c in std_rows:
    if not c["source"].startswith("registry"):
        continue
    name, spdx = c["name"], norm(c.get("license"))
    target_only = {
        "fortanix-sgx-abi": "x86_64-fortanix-unknown-sgx only",
        "r-efi": "UEFI targets only", "r-efi-alloc": "UEFI targets only",
        "hermit-abi": "hermit only", "moto-rt": "motor only", "vex-sdk": "vexos only",
        "wasip1": "wasi only", "wasip2": "wasi only", "wasip3": "wasi only", "wit-bindgen": "wasi only",
        "dlmalloc": "wasm/xous/vexos/sgx only", "unwinding": "non-default targets",
        "cc": "build-time", "find-msvc-tools": "build-time", "shlex": "build-time",
        "getopts": "libtest only", "rand": "tests only", "rand_core": "tests only", "rand_xorshift": "tests only",
        "rustc-literal-escaper": "proc_macro only",
    }.get(name)
    st = classify(spdx)
    obl = ("None for linux-x64/win32-x64 (" + target_only + ")") if target_only else "Covered by Rust std notice (MIT)"
    if name == "fortanix-sgx-abi":
        obl = "MPL-2.0 file-level copyleft would apply only if linked; it is target-gated to SGX, not linked here"
    add("kernel:rust-std-dep", name, c["version"], spdx, st,
        "rust-lang/rust@1.100.0 library/Cargo.lock; static.crates.io .crate checksum-verified; crate Cargo.toml license"
        + ("; Cargo.toml target gate in library/std" if target_only else ""), obl)

# ---- 1d. Toolchain / host runtime (not separately licensed by CodeGraph) ----
add("kernel:toolchain", "GCC 11.4 (Ubuntu 22.04) objects in linux kernel .node (cc-built grammar C; possibly crt*S.o)",
    "11.4.0", "GPL-3.0-or-later WITH GCC-exception-3.1", "copyleft",
    "ELF .comment 'GCC: (Ubuntu 11.4.0-1ubuntu1~22.04.3) 11.4.0'; licence from GCC's published runtime exception, "
    "not from a file in the bundle",
    "None if the Runtime Library Exception applies (Eligible Compilation); legal to confirm")
add("kernel:toolchain", "Host runtime: libgcc_s.so.1, libc.so.6 (linux); VCRUNTIME140.dll, UCRT api-ms-win-crt-* (win32)",
    "host", "not determined", "unknown",
    "readelf -d NEEDED / objdump -p DLL imports; dynamically linked, NOT bundled",
    "None for redistribution (not shipped); runtime prerequisite on target hosts")

# ---- 2. Vendored Node v24.22.1 ----
node_ev = ("linux 'node' sha256 e32e2d16... == bin/node in nodejs.org node-v24.22.1-linux-x64.tar.xz; "
           "win 'node.exe' sha256 d702daa8... == node.exe in node-v24.22.1-win-x64.zip; archives match nodejs.org SHASUMS256.txt")
add("node", "Node.js runtime (linux 'node' ELF + win32 'node.exe')", "24.22.1", "MIT", "permissive",
    node_ev + "; LICENSE from nodejs/node@v24.22.1",
    "Ship Node's LICENSE (2946 lines) verbatim; GAP: neither bundle ships it (official archives do)")
NOT_IN_BINARY = {"corepack": "separate dir in official archive, not in binary", "npm": "separate dir in official archive, not in binary",
                 "postject": "test fixture only", "GYP": "build tool", "jinja2": "build-time generator",
                 "markupsafe": "build-time generator", "cpplint.py": "lint tool", "gypi_to_gn.py": "build tool",
                 "gtest": "test only"}
SPDX = {
    "Acorn": "MIT", "c-ares": "MIT", "merve": "MIT", "ittapi": "BSD-3-Clause", "amaro": "MIT",
    "swc": "Apache-2.0", "ICU": "Unicode-3.0", "libuv": "MIT", "LIEF": "Apache-2.0", "llhttp": "MIT",
    "corepack": "MIT", "undici": "MIT", "postject": "MIT", "OpenSSL": "Apache-2.0", "Punycode.js": "MIT",
    "V8": "BSD-3-Clause", "SipHash": "CC0-1.0", "zlib": "Zlib", "simdjson": "Apache-2.0",
    "simdutf": "MIT", "ada": "MIT", "minimatch": "BlueOak-1.0.0",
    "npm": "Artistic-2.0", "GYP": "BSD-3-Clause", "inspector_protocol": "BSD-3-Clause", "jinja2": "BSD-3-Clause",
    "markupsafe": "BSD-3-Clause", "cpplint.py": "BSD-3-Clause", "gypi_to_gn.py": "BSD-3-Clause",
    "gtest": "BSD-3-Clause", "nghttp2": "MIT", "large_pages": "MIT", "caja": "Apache-2.0", "brotli": "MIT",
    "zstd": "BSD-3-Clause", "HdrHistogram": "CC0-1.0 OR BSD-2-Clause", "node-heapdump": "ISC", "rimraf": "ISC",
    "uvwasi": "MIT", "ngtcp2": "MIT", "nghttp3": "MIT", "node-fs-extra": "MIT", "on-exit-leak-free": "MIT",
    "sonic-boom": "MIT",
}
VERS = {"OpenSSL": "3.5.9 (version string in both binaries)", "V8": "13.6 (per BACK-77 run meta)"}
text = open(nodelic_p).read().split("\n")
for line in text:
    m = re.match(r"^- (.+?), located at (\S+?),? is licensed as follows:", line)
    if not m:
        continue
    name, loc = m.group(1), m.group(2)
    spdx = SPDX.get(name, "")
    where = NOT_IN_BINARY.get(name)
    st = classify(spdx) if spdx else "BLOCKED"
    if name == "npm":
        st = "weak-copyleft"
    obl = ("Covered by shipping Node LICENSE verbatim" if not where
           else f"None for the bundle ({where}); listed in Node LICENSE regardless")
    if name in ("OpenSSL", "swc", "LIEF", "caja", "simdjson"):
        obl = "Apache-2.0 s.4: licence copy + retained notices; satisfied by shipping Node LICENSE verbatim" + (
            f"; {where}" if where else "")
    add("node:third-party", name, VERS.get(name, "as bundled in v24.22.1"), spdx, st,
        f"nodejs/node@v24.22.1 LICENSE section '{name}' ({loc}); SPDX assigned by reading the quoted text", obl)
add("node:third-party", "ICU build scripts aclocal.m4 / config.guess (inside ICU section)", "as bundled",
    "GPL-2.0-or-later WITH Autoconf-exception-generic / GPL-3.0-or-later WITH Autoconf-exception-3.0", "copyleft",
    "nodejs/node@v24.22.1 LICENSE, ICU section 'File: aclocal.m4 (only for ICU4C)', 'File: config.guess'",
    "None for the bundle: build scripts, not compiled into node; Autoconf exception applies anyway")

# ---- 3a. tree-sitter-wasms/out (36) ----
for w in json.load(open(w36_p)):
    up = w.get("upstream_license_file")
    lic = w.get("npm_license")
    lic = lic if isinstance(lic, str) and not lic.startswith("(") else None
    head = (up or {}).get("head", "")
    if not lic:
        lic = "MIT" if "MIT License" in head or "Permission is hereby granted" in head else None
    spdx = lic or ""
    holder = next((p for p in head.split(" | ") if p.lower().startswith("copyright")), "")
    ev = (f"tree-sitter-wasms 0.1.13 pnpm-lock (HEAD 3e88dc9, package.json == shipped) -> {w['npm_package']} "
          f"{w['resolved']}; npm registry license='{w.get('npm_license')}'; ")
    ev += (f"upstream {w['repo']} {up['file']} @ {up['ref'][:12]}" if up else "upstream LICENSE not fetched at ref (see notes)")
    notes = {
        "tree-sitter-embedded_template.wasm": "; npm tarball ships LICENSE (MIT, Max Brunsfeld, GitHub 2018)",
        "tree-sitter-ocaml.wasm": "; npm tarball ships LICENSE (MIT, Max Brunsfeld and Pieter Goetschalckx 2020)",
        "tree-sitter-scala.wasm": "; npm tarball ships LICENSE (MIT, Max Brunsfeld and GitHub 2018)",
        "tree-sitter-ql.wasm": "; npm tarball has NO licence file; LICENSE on tree-sitter/tree-sitter-ql master is MIT (GitHub, Inc.)",
    }
    ev += notes.get(w["wasm"], "")
    holder = holder or {"tree-sitter-embedded_template.wasm": "Copyright (c) 2018 Max Brunsfeld, GitHub",
                        "tree-sitter-ocaml.wasm": "Copyright (c) 2020 Max Brunsfeld and Pieter Goetschalckx",
                        "tree-sitter-scala.wasm": "Copyright (c) 2018 Max Brunsfeld and GitHub",
                        "tree-sitter-ql.wasm": "Copyright (c) 2019-2024 GitHub, Inc."}.get(w["wasm"], "")
    obl = f"Include '{holder}' + {spdx} text"
    if w["wasm"] == "tree-sitter-elixir.wasm":
        obl = ("Apache-2.0 s.4: licence copy + reproduce upstream NOTICE (Elixir Team; MIT parts Max Brunsfeld, "
               "Anantha Kumaran)")
    add("wasm:tree-sitter-wasms", w["wasm"], str(w["resolved"]).split("(")[0][:60], spdx, classify(spdx), ev, obl)
add("wasm:tree-sitter-wasms", "tree-sitter-wasms (packaging)", "0.1.13", "Unlicense", "permissive",
    "lib/node_modules/tree-sitter-wasms/LICENSE + package.json", "None (public-domain dedication)")

# ---- 3b. CodeGraph-vendored lib/dist/extraction/wasm (29) ----
V = [
    ("arkts", "harmony-contrib/tree-sitter-arkts", "npm tree-sitter-arkts 0.2.0", "MIT", "Copyright (c) 2026-present richerfu",
     "BYTE-IDENTICAL to tree-sitter-arkts@0.2.0 npm tarball artifact (cmp); vendor comment grammars.ts"),
    ("c", "tree-sitter/tree-sitter-c", "v0.24.2", "MIT", "Copyright (c) 2014 Max Brunsfeld", "vendor comment grammars.ts (R7a, sha-matched parser.c)"),
    ("c_sharp", "tree-sitter/tree-sitter-c-sharp", "v0.23.5", "MIT",
     "Copyright (c) 2014-2023 Max Brunsfeld, Damien Guard, Amaan Qureshi, and contributors", "vendor comment grammars.ts + Cargo.toml"),
    ("cfml", "cfmleditor/tree-sitter-cfml (cfml/)", "revision NOT stated", "MIT",
     "Copyright (c) 2014 Max Brunsfeld / Copyright (c) 2014 Gareth Edwards & Gavin Baumanis",
     "vendor states NO provenance; identified by content: 79% of cfml/src/node-types.json named kinds present (control 3%); "
     "repo LICENSE MIT in every commit (holder line changed 2026-03-17)"),
    ("cfquery", "cfmleditor/tree-sitter-cfml (cfquery/)", "revision NOT stated", "MIT",
     "Copyright (c) 2014 Max Brunsfeld / Copyright (c) 2014 Gareth Edwards & Gavin Baumanis",
     "as cfml; 83% of cfquery node kinds present"),
    ("cfscript", "cfmleditor/tree-sitter-cfml (cfscript/)", "revision NOT stated", "MIT",
     "Copyright (c) 2014 Max Brunsfeld / Copyright (c) 2014 Gareth Edwards & Gavin Baumanis",
     "as cfml; 82% of cfscript node kinds present"),
    ("cobol", "yutaro-sakamoto/tree-sitter-cobol", "e99dbdc3d800 + CodeGraph patch", "MIT", "Copyright (c) 2016 Max Brunsfeld",
     "docs/grammars/tree-sitter-cobol.md; upstream LICENSE at e99dbdc"),
    ("cpp", "tree-sitter/tree-sitter-cpp", "v0.23.4", "MIT", "Copyright (c) 2014 Max Brunsfeld", "vendor comment grammars.ts (R7a)"),
    ("dart", "UserNobody14/tree-sitter-dart", "0038280b774b", "MIT", "Copyright (c) 2020-2023 UserNobody14 and others",
     "docs/grammars/tree-sitter-dart.md; upstream LICENSE at ref"),
    ("erlang", "WhatsApp/tree-sitter-erlang", "revision NOT pinned ('0.19' per erlang.ts comment)", "Apache-2.0",
     "WhatsApp/tree-sitter-erlang contributors (Apache LICENSE carries no copyright line; no NOTICE file)",
     "erlang.ts comment names WhatsApp/tree-sitter-erlang; content 89% node-kind match on tags 0.18-0.21; LICENSE Apache-2.0 since initial commit a8b8b0e; no NOTICE at main"),
    ("go", "tree-sitter/tree-sitter-go", "v0.23.4", "MIT", "Copyright (c) 2014 Max Brunsfeld", "vendor comment grammars.ts"),
    ("java", "tree-sitter/tree-sitter-java", "v0.23.5", "MIT", "Copyright (c) 2017 Ayman Nadeem", "vendor comment grammars.ts"),
    ("javascript", "tree-sitter/tree-sitter-javascript", "v0.25.0", "MIT", "Copyright (c) 2014 Max Brunsfeld", "vendor comment grammars.ts"),
    ("kotlin", "fwcd/tree-sitter-kotlin", "d6af96d2e23e", "MIT", "Copyright (c) 2019 fwcd", "docs/grammars/tree-sitter-kotlin.md; grammars.ts"),
    ("lua", "tree-sitter-grammars/tree-sitter-lua", "v0.4.1", "MIT", "Copyright (c) 2021 Munif Tanjim", "build.rs + grammars.ts comments"),
    ("luau", "tree-sitter-grammars/tree-sitter-luau", "v1.2.0", "MIT", "Copyright (c) 2023 Amaan Qureshi", "Cargo.toml comment"),
    ("nix", "nix-community/tree-sitter-nix", "3d0173d", "MIT", "Copyright (c) 2019 Charles Strahan", "grammars.ts comment; upstream LICENSE at 3d0173d"),
    ("pascal", "Isopod/tree-sitter-pascal", "revision NOT stated", "MIT", "Copyright (c) 2018 Benjamin Gray",
     "vendor states NO provenance; identified by content: 97% of src/node-types.json named kinds present (control 3%); LICENSE MIT since initial commit; npm 'tree-sitter-pascal' is an unrelated 0.0.1 package"),
    ("php", "tree-sitter/tree-sitter-php", "v0.24.2", "MIT", "Copyright (c) 2017 Josh Vera, GitHub; (c) 2019 Max Brunsfeld, Amaan Qureshi, Christian Frøystad, Caleb White",
     "grammars.ts (R7b)"),
    ("python", "tree-sitter/tree-sitter-python", "v0.23.6", "MIT", "Copyright (c) 2016 Max Brunsfeld", "vendor comment grammars.ts"),
    ("r", "r-lib/tree-sitter-r", "v1.2.0", "MIT", "Copyright (c) 2025 tree-sitter-r authors", "Cargo.toml comment"),
    ("ruby", "tree-sitter/tree-sitter-ruby", "v0.23.1", "MIT", "Copyright (c) 2016 Rob Rix", "grammars.ts (R7b)"),
    ("rust", "tree-sitter/tree-sitter-rust", "v0.24.2", "MIT", "Copyright (c) 2017 Maxim Sokolov", "grammars.ts (R7b)"),
    ("scala", "tree-sitter/tree-sitter-scala", "v0.26.2", "MIT", "Copyright (c) 2018 Max Brunsfeld and GitHub", "build.rs comment"),
    ("swift", "alex-pinkus/tree-sitter-swift", "0.7.4 crate tarball + CodeGraph patch", "MIT", "Copyright (c) 2021 alex-pinkus",
     "docs/grammars/tree-sitter-swift.md"),
    ("terraform", "tree-sitter-grammars/tree-sitter-hcl", "npm @tree-sitter-grammars/tree-sitter-hcl 1.2.0", "Apache-2.0",
     "tree-sitter-grammars/tree-sitter-hcl contributors (Apache LICENSE carries no copyright line; no NOTICE file)",
     "BYTE-IDENTICAL to tree-sitter-terraform.wasm in the npm 1.2.0 tarball (cmp); LICENSE Apache-2.0 at v1.2.0; no NOTICE"),
    ("tsx", "tree-sitter/tree-sitter-typescript", "v0.23.2", "MIT", "Copyright (c) 2017 Max Brunsfeld", "vendor comment grammars.ts"),
    ("typescript", "tree-sitter/tree-sitter-typescript", "v0.23.2", "MIT", "Copyright (c) 2017 Max Brunsfeld", "vendor comment grammars.ts"),
    ("vbnet", "govindbanura/tree-sitter-vbnet", "538b7087bf80 + CodeGraph patch", "MIT", "Copyright (c) 2025 Govind Banura",
     "docs/grammars/tree-sitter-vbnet.md; upstream LICENSE at 538b708"),
]
for g, repo, ref, lic, holder, how in V:
    ev = (f"lib/dist/extraction/wasm == tag src/extraction/wasm (sha256, all 29); upstream {repo}; {how}")
    if "revision NOT" not in ref and "npm" not in ref and "BYTE" not in how:
        ev += "; upstream LICENSE fetched at the named ref (raw.githubusercontent.com)"
    obl = (f"Apache-2.0 s.4: licence copy + notices ({holder})" if lic == "Apache-2.0"
           else f"Include '{holder}' + MIT text")
    if "NOT" in ref:
        obl += "; CONDITION: vendor to confirm source revision"
    add("wasm:codegraph-vendored", f"tree-sitter-{g}.wasm", ref, lic, "permissive", ev, obl)

# ---- 4. JS deps in lib/node_modules ----
JS = [("@clack/core", "1.3.0", "MIT", "LICENSE (Copyright (c) Nate Moore)"),
      ("@clack/prompts", "1.3.0", "MIT", "LICENSE (Copyright (c) Nate Moore)"),
      ("commander", "14.0.3", "MIT", "LICENSE (Copyright (c) 2011 TJ Holowaychuk)"),
      ("fast-string-truncated-width", "3.0.3", "MIT", "license (Copyright (c) 2024-present Fabio Spampinato)"),
      ("fast-string-width", "3.0.2", "MIT", "license (Copyright (c) 2024-present Fabio Spampinato)"),
      ("fast-wrap-ansi", "0.2.0", "MIT", "LICENSE (Copyright (c) 2025 James Garbutt)"),
      ("ignore", "7.0.14", "MIT", "LICENSE-MIT (Copyright (c) 2013 Kael Zhang, contributors)"),
      ("jsonc-parser", "3.3.1", "MIT", "LICENSE.md (Copyright (c) Microsoft)"),
      ("picomatch", "4.0.7", "MIT", "LICENSE (Copyright (c) 2017-present, Jon Schlinkert)"),
      ("sisteransi", "1.0.5", "MIT", "license (Copyright (c) 2018 Terkel Gjervig Nielsen)"),
      ("tree-sitter-wasms", "0.1.13", "Unlicense", "LICENSE (public-domain dedication)"),
      ("web-tree-sitter", "0.25.10", "MIT", "LICENSE (Copyright (c) 2018-2024 Max Brunsfeld); includes tree-sitter.wasm runtime")]
for n, v, l, f in JS:
    add("js:lib/node_modules", n, v, l, classify(l),
        f"package.json license='{l}' + shipped {f}; identical in linux-x64 and win32-x64 bundles",
        "Licence file already shipped in bundle; carry into NOTICE" if l != "Unlicense" else "None")

# ---- 4b. Third-party code inlined in lib/dist/viewer (not in the brief's list) ----
VIEW = [("svelte", "5.56.10", "MIT"), ("@xyflow/svelte", "1.6.5", "MIT"), ("@xyflow/system", "0.0.81", "MIT"),
        ("@svelte-put/shortcut", "4.2.0", "MIT"), ("clsx", "2.1.1", "MIT"), ("esm-env", "1.2.2", "MIT"),
        ("devalue", "5.9.4", "MIT"), ("d3-color", "3.1.0", "ISC"), ("d3-dispatch", "3.0.1", "ISC"),
        ("d3-drag", "3.0.0", "ISC"), ("d3-ease", "3.0.1", "BSD-3-Clause"), ("d3-interpolate", "3.0.1", "ISC"),
        ("d3-selection", "3.0.0", "ISC"), ("d3-timer", "3.0.1", "ISC"), ("d3-transition", "3.0.1", "ISC"),
        ("d3-zoom", "3.0.0", "ISC")]
for n, v, l in VIEW:
    add("js:dist/viewer bundle", n, v, l, classify(l),
        "tag ui/package.json + package-lock.json dependency closure of @xyflow/svelte and svelte (upper bound; "
        "tree-shaken subset in index-BSGpxBr9.js not proven); lockfile license field",
        "Bundled without licence text: add copyright + licence text to NOTICE")
for n, v, holder in [("@fontsource-variable/archivo (Archivo woff2)", "5.3.0", "Copyright 2020 The Archivo Project Authors"),
                     ("@fontsource/ibm-plex-mono (IBM Plex Mono woff/woff2)", "5.3.0", "Copyright 2017 IBM Corp.")]:
    add("js:dist/viewer bundle", n, v, "OFL-1.1", "weak-copyleft",
        "lib/dist/viewer/assets/*.woff* ; tag package-lock license=OFL-1.1; npm tarball LICENSE read (no Reserved Font Name declared)",
        f"OFL-1.1: ship OFL text + '{holder}' with the fonts; fonts may not be sold by themselves; modified fonts stay OFL")

# ---- 5. CodeGraph itself ----
add("codegraph", "@colbymchenry/codegraph (shim) + -linux-x64 + -win32-x64 bundles incl. lib/dist", "1.6.4", "MIT", "permissive",
    "LICENSE at tag 461a5d8: 'Copyright (c) 2026 Colby Mchenry'; package.json license=MIT in all three; npm tarballs list no LICENSE file",
    "Include 'Copyright (c) 2026 Colby Mchenry' + MIT text; GAP: none of the 3 npm packages ships LICENSE")

with open(out_p, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["component", "item", "version", "license_spdx", "status", "evidence", "obligations"])
    w.writerows(rows)

from collections import Counter
cnt = Counter((r[0].split(":")[0] + ":" + r[0].split(":")[1] if ":" in r[0] else r[0], r[4]) for r in rows)
for k in sorted(cnt):
    print(k, cnt[k])
print("total rows", len(rows))
