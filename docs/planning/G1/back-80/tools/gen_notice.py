#!/usr/bin/env python3
"""BACK-80 helper: generate NOTICE-codegraph.draft.txt from the inventory evidence.

usage: gen_notice.py <crates.json> <linked-linux.txt> <linked-win.txt> <inventory.csv>
                     <codegraph-LICENSE> <elixir-NOTICE> <node-LICENSE> <out.txt>
Run with `python3 -I`.
"""
import csv, hashlib, json, re, sys, textwrap

crates_p, lin_p, win_p, inv_p, cg_lic_p, elixir_p, node_lic_p, out_p = sys.argv[1:9]
crates = {(c["name"], c["version"]): c for c in json.load(open(crates_p))}
linked = set()
for p in (lin_p, win_p):
    for line in open(p):
        a = line.split()
        if len(a) >= 2 and a[0] != "codegraph-kernel":
            linked.add((a[0], a[1].lstrip("v")))
inv = list(csv.DictReader(open(inv_p)))
node_sha = hashlib.sha256(open(node_lic_p, "rb").read()).hexdigest()

UPSTREAM_HOLDER = {  # for linked crates whose .crate has no copyright line (upstream repo LICENSE / Cargo authors)
    "ctor": "Matt Mastracci", "libloading": "Copyright (c) 2015, Simonas Kazlauskas",
    "napi": "Copyright (c) 2020-present LongYinan (napi-rs)", "napi-sys": "Copyright (c) 2020-present LongYinan (napi-rs)",
    "pin-project-lite": "pin-project-lite authors (taiki-e)", "rustc-hash": "The Rust Project Developers",
    "tree-sitter": "Copyright (c) 2018-2024 Max Brunsfeld",
    "tree-sitter-cpp": "Copyright (c) 2014 Max Brunsfeld", "tree-sitter-go": "Copyright (c) 2014 Max Brunsfeld",
    "tree-sitter-java": "Copyright (c) 2017 Ayman Nadeem", "tree-sitter-luau": "Copyright (c) 2023 Amaan Qureshi",
    "tree-sitter-python": "Copyright (c) 2016 Max Brunsfeld", "tree-sitter-r": "Copyright (c) 2025 tree-sitter-r authors",
    "tree-sitter-ruby": "Copyright (c) 2016 Rob Rix", "tree-sitter-typescript": "Copyright (c) 2017 Max Brunsfeld",
}

MIT = """Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE."""

ISC = """Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE."""

BSD3_D3EASE = "d3-ease 3.0.1: Copyright 2010-2021 Mike Bostock; Copyright 2001 Robert Penner [BSD-3-Clause; ship its LICENSE text]"

out = []
w = out.append
w("=" * 78)
w("DRAFT FOR LEGAL REVIEW - NOT LEGAL ADVICE - NOT APPROVED FOR DISTRIBUTION")
w("=" * 78)
w(textwrap.dedent(f"""
    Third-party notices for CodeGraph 1.6.4 as redistributed by Kemetra
    Jira BACK-80. Prepared 2026-11-22 by an engineering licence inventory; see
    docs/planning/G1/back-80/inventory.csv for the evidence behind every line.

    Covers the npm packages, byte-identical to the registry tarballs whose
    SHA-512 digests appear in their npm provenance attestations:
      @colbymchenry/codegraph-linux-x64@1.6.4  (vendored node ELF, lib/)
      @colbymchenry/codegraph-win32-x64@1.6.4  (vendored node.exe, lib/)
      @colbymchenry/codegraph@1.6.4            (npm shim, dist/ type files)

    Open points for legal review are marked [REVIEW].
    """).strip("\n"))

w("\n" + "-" * 78 + "\nPART A. CodeGraph\n" + "-" * 78)
w("CodeGraph 1.6.4 (github.com/colbymchenry/codegraph, tag v1.6.4, commit 461a5d8)")
w("License: MIT. NOTE: none of the three npm packages ships this LICENSE file;")
w("it is reproduced here from the tagged source.\n")
w(open(cg_lic_p).read().strip())
w("\nIncludes CodeGraph's patches to tree-sitter-cobol, tree-sitter-vbnet and")
w("tree-sitter-swift (docs/grammars/*.patch), under CodeGraph's MIT licence.")

w("\n" + "-" * 78 + "\nPART B. Node.js v24.22.1 (bin 'node' / 'node.exe')\n" + "-" * 78)
w(textwrap.dedent(f"""
    The bundles contain the unmodified official Node.js v24.22.1 binaries
    (sha256 linux e32e2d16..., win d702daa8...; identical to nodejs.org builds).
    Node.js is MIT-licensed and bundles third-party components under MIT,
    Apache-2.0 (OpenSSL 3.5.9, swc, simdjson, LIEF, caja), BSD-3-Clause (V8,
    zstd, ...), Unicode-3.0 (ICU), Zlib, ISC, BlueOak-1.0.0, CC0-1.0 and others.

    OBLIGATION: ship the complete Node.js LICENSE file verbatim alongside the
    binary, for example as third_party/node-v24.22.1-LICENSE.txt.
      Source: https://raw.githubusercontent.com/nodejs/node/v24.22.1/LICENSE
      sha256 {node_sha}  (2946 lines; identical to LICENSE inside the
      official linux-x64 archive, and the same text modulo CRLF in win-x64)
    Neither CodeGraph bundle ships this file today. [REVIEW]
    """).strip("\n"))

w("\n" + "-" * 78 + "\nPART C. Native extraction kernel lib/kernel/codegraph-kernel.node\n" + "-" * 78)
w("Rust cdylib built from codegraph-kernel (MIT, Part A). Statically linked Rust")
w("crates (cargo tree -e normal,no-proc-macro for x86_64-unknown-linux-gnu and")
w("x86_64-pc-windows-msvc, codegraph-kernel/Cargo.lock @ v1.6.4). Where a crate is")
w("dual- or triple-licensed, MIT is elected.\n")
mit_lines, isc_lines = [], []
for (n, v) in sorted(linked):
    c = crates[(n, v)]
    lic = (c.get("license") or "").replace("MIT/Apache-2.0", "MIT OR Apache-2.0")
    holders = sorted({l.split(": ", 1)[-1] for l in c.get("copyright_lines") or []})
    h = "; ".join(holders) if holders else UPSTREAM_HOLDER.get(n, "the " + n + " authors")
    line = f"  {n} {v} [{lic}] - {h}"
    (isc_lines if lic == "ISC" else mit_lines).append(line)
w("Under MIT (elected where dual-licensed):")
out.extend(mit_lines)
w("  Rust standard library (std/core/alloc, rustc 1.100.0) [MIT OR Apache-2.0] -")
w("    Copyright (c) The Rust Project Contributors; std's registry deps (addr2line,")
w("    adler2, gimli, hashbrown, libc, memchr, miniz_oxide, object, rustc-demangle,")
w("    cfg-if) MIT-or-Apache/Zlib; compiler_builtins [MIT AND Apache-2.0 WITH")
w("    LLVM-exception AND (MIT OR Apache-2.0)].  [REVIEW: Rust ships COPYRIGHT-library.html")
w("    per release; consider attaching it instead of this summary]")
w("Vendored grammar C compiled into the kernel (codegraph-kernel/grammars):")
for r in inv:
    if r["component"] == "kernel:vendored-c":
        h = r["obligations"].split("'")[1]
        w(f"  {r['item'].split(' (')[0]} @ {r['version']} [MIT] - {h}")
w("  (kotlin's vendored directory ships no LICENSE file; upstream fwcd/tree-sitter-kotlin is MIT)")
w("\nUnder ISC:")
out.extend(isc_lines)
w("\nGCC 11.4 (Linux build) objects are covered by the GCC Runtime Library Exception 3.1. [REVIEW]")
w("The kernel dynamically links the host's libgcc_s/libc (Linux) and VCRUNTIME140/UCRT (Windows);")
w("these are NOT bundled.")

w("\n" + "-" * 78 + "\nPART D. WebAssembly grammars (wasm fallback parser)\n" + "-" * 78)
groups = {}
for r in inv:
    if r["component"].startswith("wasm:") and r["item"].endswith(".wasm"):
        lic = r["license_spdx"]
        m = re.search(r"'(.+?)' \+", r["obligations"]) or re.search(r"notices \((.+)\)", r["obligations"])
        h = m.group(1) if m else r["obligations"]
        if lic == "Apache-2.0":
            h = {"tree-sitter-elixir.wasm": "The Elixir Team (see NOTICE below)"}.get(r["item"], h)
        where = "tree-sitter-wasms/out" if "tree-sitter-wasms" in r["component"] else "lib/dist/extraction/wasm"
        groups.setdefault(lic, []).append(f"  {where}/{r['item']} ({r['version'][:60]}) - {h}")
w("Packaged by tree-sitter-wasms 0.1.13 (Unlicense: public-domain dedication) and by")
w("CodeGraph (lib/dist/extraction/wasm). Each grammar keeps its upstream licence:\n")
w("Under MIT:")
out.extend(groups.get("MIT", []))
w("  [REVIEW] pascal, cfml, cfquery and cfscript: the vendor states no source revision.")
w("  They were identified by content (Isopod/tree-sitter-pascal, cfmleditor/tree-sitter-cfml).")
w("  Both repos were MIT in every commit, but the cfml copyright line changed in 2026-03,")
w("  so both holders are listed.")
w("\nUnder Apache-2.0 (ship the Apache License 2.0 text: https://www.apache.org/licenses/LICENSE-2.0.txt):")
out.extend(groups.get("Apache-2.0", []))
w("\nNOTICE reproduced from elixir-lang/tree-sitter-elixir @ 11426c5 (Apache-2.0 s.4(d)):")
w(textwrap.indent(open(elixir_p).read().strip(), "  | ", lambda _l: True))

w("\n" + "-" * 78 + "\nPART E. JavaScript packages\n" + "-" * 78)
w("lib/node_modules (each ships its own licence file in the bundle):")
for r in inv:
    if r["component"] == "js:lib/node_modules":
        m = re.search(r"shipped \S+ \((.+?)\)(;|$)", r["evidence"])
        hol = m.group(1) if m else ""
        w(f"  {r['item']} {r['version']} [{r['license_spdx']}] - {hol}")
w("\nInlined in lib/dist/viewer/assets/index-*.js (Svelte UI bundle; NO licence text shipped). [REVIEW: list is")
w("the lockfile dependency closure, an upper bound of what the minified bundle contains]")
for r in inv:
    if r["component"] == "js:dist/viewer bundle" and r["license_spdx"] != "OFL-1.1":
        w(f"  {r['item']} {r['version']} [{r['license_spdx']}]")
w("  " + BSD3_D3EASE)
w("  Copyright lines read from each npm tarball's LICENSE: svelte - (c) 2016-2025 Svelte Contributors;")
w("  @xyflow/svelte, @xyflow/system - (c) 2019-2025 webkid GmbH; @svelte-put/shortcut - (c) 2023-2024")
w("  Quang Phan; clsx - (c) Luke Edwards; esm-env - 2022 Benjamin McCann; devalue - (c) 2018-19 devalue")
w("  contributors; d3-color 2010-2022, other d3-* 2010-2021 - Mike Bostock (ISC).")
w("\nFonts in lib/dist/viewer/assets (SIL Open Font License 1.1; no Reserved Font Name declared):")
for r in inv:
    if r["license_spdx"] == "OFL-1.1":
        w(f"  {r['item']} {r['version']} - {r['obligations'].split(chr(39))[1]}")
w("  OBLIGATION: ship the OFL-1.1 text (https://openfontlicense.org) with the fonts; the fonts may")
w("  not be sold on their own.")

w("\n" + "-" * 78 + "\nLICENCE TEXTS\n" + "-" * 78)
w("MIT License (applies to every [MIT] entry above with that entry's copyright line):\n")
w(MIT)
w("\nISC License (applies to every [ISC] entry above with that entry's copyright line):\n")
w(ISC)
w("\nTo ship as separate files (not reproduced here): Node.js LICENSE (Part B), Apache License 2.0,")
w("BSD-3-Clause text for d3-ease, SIL OFL 1.1, and the Unlicense text for tree-sitter-wasms.")
w("\n" + "=" * 78 + "\nEND OF DRAFT - requires legal review before any redistribution\n" + "=" * 78)
open(out_p, "w").write("\n".join(out) + "\n")
print("wrote", out_p, len(out), "lines")
