# BACK-80: CodeGraph 1.6.4 licence inventory

> **This is an engineering inventory, not legal clearance.** It records what was observed, where, and how. It is input for a legal review and is not legal advice. Signing off BACK-80 is a separate owner and legal decision.

**Why this exists.**
- The owner approved this review on 22 Nov 2026 ("start BACK-80 licence review").
- Until it is signed off, CodeGraph may be used only on synthetic fixtures. This is condition 1 of [DECISION-2026-11-22](../back-23/DECISION-2026-11-22.md).

**Files in this folder.**
- `inventory.csv`: 256 rows, with the columns `component, item, version, license_spdx, status, evidence, obligations`.
- `NOTICE-codegraph.draft.txt`: a draft attribution file for redistributing the linux-x64 and win32-x64 bundles. It is marked for legal review.
- `tools/`: the scripts that produced the evidence. Use them to re-run the inventory for a new version.

## 1. Scope and method

**What was reviewed.**
- `@colbymchenry/codegraph@1.6.4`, the shim. Its `dist/` holds only 341 `.d.ts` type files.
- `@colbymchenry/codegraph-linux-x64@1.6.4`. This is the installed copy from BACK-77, which is byte-identical to a fresh `npm pack`.
- `@colbymchenry/codegraph-win32-x64@1.6.4`. It was fetched with `npm pack` and unpacked with `tar`, and was never installed or executed.
- The source at tag `v1.6.4`. It is a lightweight tag, and `v1.6.4^{commit}` = `461a5d87a873a4932997cd9a49042ab30e45a675` was verified.

**What was never done.**
- No CodeGraph CLI, install, init, MCP, hook or binary was run, and the kernel was not built.
- Downloaded material was only hashed, unpacked and read, using `strings`, `readelf`, `objdump` and Python run as `python3 -I`.

**Evidence source for each component.**

| Component | Source used |
|---|---|
| Rust crates (73) | All 72 registry `.crate` files were fetched from `static.crates.io`; the crates.io API itself returned 403. Their SHA-256 was checked against `Cargo.lock`, and all 72 match. `license` was read from each crate's own `Cargo.toml`. `cargo tree --locked` was run per target, with an isolated `CARGO_HOME`; this only resolves and builds nothing. It separates linked crates from build-only crates |
| Rust std | rust-lang/rust@1.100.0: `COPYRIGHT`, `library/Cargo.lock` (its registry crates fetched and checksum-verified), `library/std/Cargo.toml` target gates, and `compiler-builtins/Cargo.toml` |
| Node | The official `node-v24.22.1-linux-x64.tar.xz` and `-win-x64.zip`, verified against nodejs.org `SHASUMS256.txt`. `LICENSE` was taken from nodejs/node@v24.22.1, and each quoted section was read and mapped to an SPDX id |
| tree-sitter-wasms (36) | Gregoor/tree-sitter-wasms HEAD `3e88dc9`; its `package.json` is byte-equal to the shipped 0.1.13. Versions were resolved from its `pnpm-lock.yaml`. Each licence was read from the npm registry and from the upstream LICENSE at `gitHead` or the tag. For 4 packages the LICENSE came from the npm tarball |
| CodeGraph-vendored wasm (29) | All 29 are SHA-256-identical to `src/extraction/wasm` at the tag. The upstream repo and ref come from the vendor's `grammars.ts`, `Cargo.toml`, `build.rs` and `docs/grammars/*.md`, and the upstream LICENSE was read at that ref. Where the vendor says nothing, the grammar was identified by its content |
| JS deps | `package.json` plus the licence files shipped in `lib/node_modules`. The viewer bundle's dependency closure was taken from the tag's `package-lock.json`, with each LICENSE read from the package's npm tarball |

## 2. Findings per component

### 2.1 Native `lib/kernel/codegraph-kernel.node` (Rust cdylib, 37.5 MB per platform)

| Group | Count | Licences | Status |
|---|---|---|---|
| Cargo.lock packages | 73 (72 registry crates plus the `codegraph-kernel` path crate, which is MIT) | 37 `MIT OR Apache-2.0`, 6 `Apache-2.0 OR MIT`, 1 `MIT/Apache-2.0`, 24 `MIT`, 2 `Unlicense OR MIT`, 1 `ISC` (libloading), 1 `(MIT OR Apache-2.0) AND Unicode-3.0` (unicode-ident, build-only) | all 73 permissive |
| Linked into the binary | 47 per target (`libc` on Linux, `windows-link` on Windows), 48 unique, plus `codegraph-kernel` | as above | permissive |
| Build-time or proc-macro only | 24 (cc, syn, quote, proc-macro2, napi-build, napi-derive*, serde*, semver, convert_case, unicode-ident, …) | as above | not redistributed, so no obligation |
| Vendored grammar C sources | 5: kotlin d6af96d, lua v0.4.1, scala v0.26.2, dart 0038280b, swift 0.7.4 (+patch) | MIT | permissive. Gap: `grammars/kotlin` has no LICENSE file; upstream is MIT |
| Rust std (rustc 1.100.0) | std/core/alloc + `compiler_builtins` + 31 registry deps | MIT OR Apache-2.0; compiler_builtins `MIT AND Apache-2.0 WITH LLVM-exception AND (MIT OR Apache-2.0)`; foldhash Zlib | 32 permissive and 1 weak-copyleft. The weak-copyleft one is `fortanix-sgx-abi` (MPL-2.0); it is gated to the SGX target and **not linked** into our targets. `r-efi` (`MIT OR Apache-2.0 OR LGPL-2.1-or-later`) is UEFI-only, and MIT can be elected |
| Toolchain objects | GCC 11.4 objects in the Linux .node (seen in `.comment`) | GPL-3.0-or-later WITH GCC-exception-3.1 | copyleft with a runtime exception. There is no obligation if this counts as an Eligible Compilation; **legal to confirm** |
| Host runtime | libgcc_s and libc on Linux; VCRUNTIME140 and UCRT on Windows | not determined | unknown. These are dynamically linked and **not bundled**, so nothing is redistributed |

Several crates ship **no licence file** inside the `.crate`:
- napi, napi-build, napi-derive, napi-derive-backend, napi-sys;
- tree-sitter, tree-sitter-cpp, -go, -java, -luau, -python, -r, -ruby, -typescript.

For these, the copyright holders were taken from the upstream LICENSE or the Cargo `authors` field (NOTICE draft, Part C).

### 2.2 Vendored Node v24.22.1

**The binaries are the official builds.**
- Linux `node` and win32 `node.exe` are byte-identical to the binaries in the official nodejs.org archives.
- Both contain OpenSSL **3.5.9**.
- CodeGraph's `scripts/build-bundle.sh` verifies the archive against SHASUMS and then copies **only the binary**.

**Neither bundle ships Node's `LICENSE`.** The official archives do (2946 lines). All 44 sections were classified:

| Licence | Components |
|---|---|
| MIT | Node core, Acorn, c-ares, merve, amaro, libuv, llhttp, undici, Punycode.js, simdutf, ada, nghttp2, ngtcp2, nghttp3, large_pages, brotli, uvwasi, node-fs-extra, on-exit-leak-free, sonic-boom. corepack and postject are also MIT but are not in the binary |
| Apache-2.0 | OpenSSL, swc, simdjson, LIEF, caja |
| BSD-3-Clause | V8, ittapi, inspector_protocol, zstd. GYP, jinja2, markupsafe, cpplint, gypi_to_gn and gtest are tooling and are not in the binary |
| Unicode-3.0 | ICU |
| Zlib | zlib |
| ISC | node-heapdump, rimraf |
| BlueOak-1.0.0 | minimatch |
| CC0-1.0 | SipHash |
| CC0-1.0 OR BSD-2-Clause | HdrHistogram |
| Artistic-2.0 (weak-copyleft) | npm. It is **not in the binary**; it ships only in the official archives |
| GPL WITH Autoconf exception (copyleft) | ICU's `aclocal.m4` and `config.guess`. These are build scripts and are **not compiled into node** |

The result is 44 permissive rows, 1 weak-copyleft row and 1 copyleft row. Neither copyleft item is in the bundle.

Shipping the full Node `LICENSE` verbatim satisfies every section, including Apache-2.0 §4 for OpenSSL, swc, simdjson, LIEF and caja.

### 2.3 Wasm grammars

**`lib/node_modules/tree-sitter-wasms/out` (36 grammars).**
- The packaging is Unlicense, but each grammar keeps its upstream licence: **35 are MIT and 1 is Apache-2.0** (tree-sitter-elixir 0.1.1).
- Elixir's upstream `NOTICE` must be reproduced. It is in the NOTICE draft.
- `tree-sitter-ql` 1.0.0: npm declares MIT, but there is no licence file at that release. The LICENSE on current master is MIT (GitHub, Inc.).
- **Caveat:** tree-sitter-wasms publishes no build provenance. The resolved versions come from the repo lockfile at HEAD, whose `package.json` equals the shipped one.

**`lib/dist/extraction/wasm` (29 grammars, all byte-identical to the tag).**

| Group | Grammars | Upstream and licence | How identified |
|---|---|---|---|
| Kernel-aligned | c, cpp, c_sharp, go, java, javascript, python, ruby, rust, php, typescript, tsx | tree-sitter/*, MIT | the vendor's comments in `grammars.ts`, plus the LICENSE at the tag |
| Vendor-documented | kotlin, dart, swift (+patch), cobol (+patch), vbnet (+patch), lua, luau, r, scala, nix | each upstream repo, MIT | `docs/grammars/*.md`, `build.rs` and `Cargo.toml`, plus the LICENSE at that ref |
| Byte-identical to an npm artefact | arkts (tree-sitter-arkts 0.2.0) | MIT | `cmp` against the npm tarball |
| Byte-identical to an npm artefact | terraform (@tree-sitter-grammars/tree-sitter-hcl 1.2.0) | **Apache-2.0**, no NOTICE | `cmp` against the npm tarball |
| Named but not pinned | erlang (WhatsApp/tree-sitter-erlang, "0.19") | **Apache-2.0** since its first commit, no NOTICE | node kinds match 89% for tags 0.18 to 0.21 |
| **Vendor silent** | pascal | Isopod/tree-sitter-pascal, MIT in every commit | by content: 97% of named node kinds match, against 3% for a control |
| **Vendor silent** | cfml, cfscript, cfquery | cfmleditor/tree-sitter-cfml, MIT in every commit | by content: 79–83% match, against 3% for a control. The copyright line changed on 2026-03-17, so the NOTICE lists both holders |

**Result:** all 65 grammars are permissive: 62 MIT and 3 Apache-2.0 (elixir, erlang and terraform).

The revisions of pascal, cfml and erlang are uncertain. That is a condition, not a block, because their licence is the same in every upstream commit.

### 2.4 JS dependencies

**`lib/node_modules`** has 12 packages, identical on linux and win32:
- `@clack/core` and `@clack/prompts` 1.3.0, commander 14.0.3, fast-string-truncated-width 3.0.3, fast-string-width 3.0.2, fast-wrap-ansi 0.2.0, ignore 7.0.14, jsonc-parser 3.3.1, picomatch 4.0.7, sisteransi 1.0.5 and web-tree-sitter 0.25.10 are MIT.
- tree-sitter-wasms 0.1.13 is Unlicense.

All 12 ship a licence file. **This corrects BACK-21 and BACK-77:** `@clack/*` *does* ship an MIT `LICENSE` (Copyright (c) Nate Moore). The controller confirmed this in the installed bundle.

**`lib/dist/viewer`** was not in the brief.
- It is a Svelte UI bundle that inlines svelte 5.56.10, @xyflow/svelte 1.6.5, @xyflow/system 0.0.81, @svelte-put/shortcut, clsx, esm-env, devalue and d3-* 3.x. These are MIT and ISC, except d3-ease, which is BSD-3-Clause. The bundle ships **no licence text** for them.
- It also ships the **Archivo** and **IBM Plex Mono** web fonts under **OFL-1.1** (weak-copyleft). The controller confirmed the `.woff2` files are present.
- The package list is the lockfile closure, so it is an upper bound.
- Result: 16 permissive and 2 weak-copyleft.

### 2.5 CodeGraph itself

- CodeGraph is MIT, "Copyright (c) 2026 Colby Mchenry" (the LICENSE at the tag).
- `package.json` says MIT in all three packages, but **none of the three npm tarballs contains a LICENSE file**. The controller confirmed this in the installed copy.
- CodeGraph's patches to cobol, vbnet and swift fall under its MIT licence.

## 3. Copyleft and weak-copyleft obligations

| Item | Licence | In the shipped bundle? | Obligation |
|---|---|---|---|
| Archivo and IBM Plex Mono fonts | OFL-1.1 | **yes** (viewer assets) | Ship the OFL text and the font copyright lines with the fonts. The fonts may not be sold on their own, and a modified font stays OFL. The obligation does not reach the software |
| GCC 11.4 objects in the Linux kernel | GPL-3.0+ WITH GCC-exception-3.1 | yes, inside the .node | None, if this is an Eligible Compilation (a normal gcc/cc build). **Legal to confirm** |
| fortanix-sgx-abi | MPL-2.0 (file-level) | no; gated to the SGX target only | None for linux-x64 or win32-x64 |
| r-efi, r-efi-alloc | MIT OR Apache-2.0 OR LGPL-2.1+ | no; UEFI only | None; MIT would be elected |
| npm (listed in the Node LICENSE) | Artistic-2.0 | no; not in the binary | None for our bundle |
| ICU `aclocal.m4` and `config.guess` | GPL with Autoconf exception | no; build scripts only | None |

Nothing in the bundles is under GPL, LGPL, AGPL, SSPL, BUSL or PolyForm, other than the GCC objects covered by the runtime exception.

## 4. Build provenance

**Proven:**
1. **Attested tarballs.** All three registry tarballs match, by SHA-512, the subject of their npm SLSA v1 provenance attestation. That attestation names `.github/workflows/release.yml`, run `44758615827`, at commit `b4392571…` on `main`.
2. **Commit vs tag.** `b439257` is an ancestor of the tag commit `461a5d8`, and the only difference between them is an auto-generated CHANGELOG change (+4 lines). `codegraph-kernel/`, `src/extraction/wasm/` and `scripts/` are identical, so the kernel was built from the tag's `Cargo.lock` content.
3. **Release workflow.** It builds the kernel on `ubuntu-22.04` and `windows-latest` with `cargo build --release --target …`, attests the build (`actions/attest-build-provenance`), and publishes with `npm publish --provenance`.
4. **Strings in the binaries.**
   - Both kernels name `rustc 1.100.0`.
   - The Linux kernel names `GCC 11.4 (Ubuntu 22.04)` and `/home/runner/…` paths; the Windows kernel has `runneradmin` paths.
   - Every crate version embedded as a panic location matches `Cargo.lock`: 7 crates on Linux and 10 on Windows.
5. **Byte identity.**
   - The Node binaries match nodejs.org v24.22.1.
   - All 29 vendored wasm grammars match the tag.
   - linux and win32 have identical `lib/dist` and `lib/node_modules`.
   - The installed linux copy equals the registry tarball.

**Not proven:**
- **Sigstore signatures.** `gh attestation verify` could not initialise a verifier in this sandbox (no TUF root). The attestations were matched by digest but **not cryptographically verified**.
- **A reproducible build.** The kernel was not rebuilt, and it is stripped. Only 7 to 10 of the 48 linked crates are visible as strings.
- **Lock enforcement.** CI runs `cargo build` **without `--locked`**. `cargo tree --locked` succeeds, so resolution should match `Cargo.lock`, but CI does not enforce it.
- **CI logs.** The Actions logs were not read, because they need credentials this session does not have.
- **tree-sitter-wasms 0.1.13.** It has no provenance, so its build inputs are inferred from the lockfile.

## 5. BLOCKED items

**None.** Every redistributed component's licence was observed in a primary source.

The following items rest on partial evidence. They are recorded as conditions, not blocks:
- pascal, cfml, cfscript and cfquery: identified by content (the vendor states no revision); each is MIT throughout its upstream history.
- erlang: the revision is not pinned; it is Apache-2.0 throughout.
- tree-sitter-ql: no LICENSE at 1.0.0; npm declares MIT, and master is MIT.
- The viewer bundle: its package list is an upper bound.
- The host runtime libraries: not bundled.

## 6. Attribution obligations if the bundles are redistributed

The bundles currently ship none of the following, so whoever redistributes them must add these (see `NOTICE-codegraph.draft.txt`):
1. The CodeGraph MIT LICENSE.
2. The Node.js `LICENSE` for v24.22.1, verbatim.
3. Copyright lines and MIT and ISC texts for the 48 linked crates, Rust std and the 5 vendored grammar C sources.
4. Copyright lines and licence texts for the 65 wasm grammars, the Apache-2.0 text, and the tree-sitter-elixir `NOTICE`.
5. Copyright lines and licence texts for the viewer bundle's packages, the d3-ease BSD-3-Clause text, and the OFL-1.1 text with the font copyrights.

The 12 `lib/node_modules` packages already ship their own licence files.

Internal use on internal machines, without redistribution, triggers essentially none of these notice duties. That still needs legal confirmation for our setting.

## 7. Recommendation: SIGN-OFF WITH CONDITIONS

No copyleft obligation attaches to CodeGraph's code or to ours. The only copyleft-family item actually shipped is the two OFL fonts in the optional viewer UI. Nothing is BLOCKED.

Conditions:
1. **No redistribution of the bundles,** internally or externally, until the NOTICE draft has been legally reviewed and is shipped together with the Node `LICENSE`, Apache-2.0, OFL-1.1, BSD-3-Clause and Unlicense texts.
2. **Verify the provenance signatures** on a machine with Sigstore access: run `npm audit signatures` on an isolated install, or `gh attestation verify`. Pin the bundles by SHA-512.
3. **Ask the vendor** to:
   - record provenance for the pascal, cfml/cfscript/cfquery and erlang wasm grammars;
   - add a LICENSE to `codegraph-kernel/grammars/kotlin`;
   - ship `LICENSE` in the npm packages;
   - use `cargo build --locked`.

   Until then, accept the identification by content documented here.
4. **Legal to confirm** the GCC runtime exception, the OFL font obligations, and that the Node `LICENSE` covers the embedded Node components.
5. **Re-run this inventory on any version bump,** using `tools/`.

## 8. Limitations

- SPDX identifiers were assigned by reading licence texts and metadata. They are not a legal opinion.
- Only linux-x64 and win32-x64 were reviewed; darwin and arm64 were not.
- Whether each Node component is present in the binary was judged with a string heuristic. Shipping the full LICENSE makes this moot.
- Rust std's full per-release `COPYRIGHT-library.html` was not fetched; its registry dependencies were inventoried instead.
- The tree-shaken contents of the viewer bundle were not proven.

**This is not legal clearance.**
