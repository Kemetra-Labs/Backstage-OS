#!/usr/bin/env python3
"""BACK-80 helper: licence evidence for the 36 grammars in tree-sitter-wasms 0.1.13.

Reads the resolved versions from tree-sitter-wasms' pnpm-lock.yaml (repo HEAD
3e88dc9, whose package.json is byte-equal to the shipped 0.1.13 one), then for
each grammar package fetches the npm registry version document (license,
repository, gitHead) and the upstream LICENSE file from raw.githubusercontent
(at gitHead, else tag v<version>, else <version>, else the pinned github ref).
Nothing is installed or executed. Run with `python3 -I`.

usage: wasm_grammar_licenses.py <pnpm-lock.yaml> <out.json>
"""
import json, re, sys, urllib.request, urllib.parse

OUT_TO_PKG = {
 "bash":"tree-sitter-bash","c":"tree-sitter-c","c_sharp":"tree-sitter-c-sharp","cpp":"tree-sitter-cpp",
 "css":"tree-sitter-css","dart":"tree-sitter-dart","elisp":"tree-sitter-elisp","elixir":"tree-sitter-elixir",
 "elm":"tree-sitter-elm","embedded_template":"tree-sitter-embedded-template","go":"tree-sitter-go",
 "html":"tree-sitter-html","java":"tree-sitter-java","javascript":"tree-sitter-javascript","json":"tree-sitter-json",
 "kotlin":"tree-sitter-kotlin","lua":"tree-sitter-lua","objc":"tree-sitter-objc","ocaml":"tree-sitter-ocaml",
 "php":"tree-sitter-php","python":"tree-sitter-python","ql":"tree-sitter-ql","rescript":"tree-sitter-rescript",
 "ruby":"tree-sitter-ruby","rust":"tree-sitter-rust","scala":"tree-sitter-scala","solidity":"tree-sitter-solidity",
 "swift":"tree-sitter-swift","systemrdl":"tree-sitter-systemrdl","tlaplus":"@tlaplus/tree-sitter-tlaplus",
 "toml":"tree-sitter-toml","tsx":"tree-sitter-typescript","typescript":"tree-sitter-typescript",
 "vue":"tree-sitter-vue","yaml":"tree-sitter-yaml","zig":"@tree-sitter-grammars/tree-sitter-zig",
}

def get(url, t=40):
    try:
        with urllib.request.urlopen(url, timeout=t) as r:
            return r.status, r.read()
    except Exception as e:
        return getattr(e, "code", 0), b""

lock = open(sys.argv[1]).read()
dev = lock.split("devDependencies:")[1].split("\npackages:")[0]
resolved = {}
for m in re.finditer(r"\n  '?([^'\n:]+)'?:\n    specifier: ([^\n]+)\n    version: ([^\n]+)", dev):
    resolved[m.group(1)] = (m.group(2).strip(), m.group(3).strip())

def gh_parse(url):
    m = re.search(r"github\.com[/:]([^/]+)/([^/#.]+)", url or "")
    return (m.group(1), m.group(2)) if m else None

rows = []
for out, pkg in OUT_TO_PKG.items():
    spec, ver = resolved.get(pkg, ("?", "?"))
    row = {"wasm": f"tree-sitter-{out}.wasm", "npm_package": pkg, "specifier": spec, "resolved": ver}
    refs = []
    if ver.startswith("github.com/"):
        _, owner, repo, sha = ver.split("/")[:4]
        row["repo"] = f"{owner}/{repo}"; refs = [sha]; row["npm_license"] = "(github ref, no registry doc)"
    else:
        v = ver.split("(")[0]
        st, body = get("https://registry.npmjs.org/" + urllib.parse.quote(pkg, safe="@") + "/" + v)
        doc = json.loads(body) if st == 200 else {}
        row["npm_version"] = v
        row["npm_license"] = doc.get("license") or doc.get("licenses")
        repo = doc.get("repository")
        repo = repo.get("url") if isinstance(repo, dict) else repo
        gp = gh_parse(repo)
        row["repo"] = f"{gp[0]}/{gp[1]}" if gp else repo
        refs = [r for r in (doc.get("gitHead"), f"v{v}", v) if r]
    found = None
    if row.get("repo") and "/" in str(row["repo"]):
        for ref in refs:
            for fn in ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "license"):
                st, body = get(f"https://raw.githubusercontent.com/{row['repo']}/{ref}/{fn}")
                if st == 200 and body:
                    txt = body.decode("utf-8", "replace")
                    found = {"ref": ref, "file": fn,
                             "head": " | ".join(l.strip() for l in txt.splitlines() if l.strip())[:200]}
                    break
            if found: break
    row["upstream_license_file"] = found
    rows.append(row)
json.dump(rows, open(sys.argv[2], "w"), indent=1)
print(len(rows), "grammars;", sum(1 for r in rows if r["upstream_license_file"]), "with upstream LICENSE fetched")
