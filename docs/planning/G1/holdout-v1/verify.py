#!/usr/bin/env python3
"""Verify the frozen G1 hold-out fixture v1 (Jira BACK-29). Stdlib only, ASCII output only.

Usage (from the repository root):
  python3 -B docs/planning/G1/holdout-v1/verify.py

Exits 0 only when every check passes, 1 otherwise. It never writes a file. Checks:
  1. MANIFEST.json: every file under holdout-v1/ (except MANIFEST.json itself, __pycache__ and *.pyc) is listed with
     the right sha256, no listed file is missing, the manifest tree hash matches, and the pins for score.py and
     envelope.schema.v1.json match the files in ../fixture/.
  2. The src/ tree hash (score.py tree_hash algorithm) matches ground-truth.json fixture.tree_sha256 and source.revision.
  3. Provenance: every node line exists and names its symbol; every edge line exists and contains its evidence token;
     every imports specifier is on its line and resolves (tsconfig paths, relative, Python dotted) to the edge's target;
     every calls line names the callee (or its local binding); the enclosing symbol is the innermost listed symbol
     before the line (decorators: the module); observed calls only use bindings the caller imports; contains edges
     match node lines. Negatives and external imports are checked the same way.
  4. Import census: every import-like line in src/ is a ground-truth imports edge (observed or unknown), a listed
     external import, or the evidence of a negative.
  5. Required case coverage (contract section 6 item 2 plus negatives, unknowns, omission and coverage).
  6. Scoring with the existing ../fixture/score.py: the ground truth, read as a kawalys.graph.v1 envelope, scores 100%
     against itself (schema valid, 0 contract errors, every edge matched on its exact line, every unknown
     marked_unknown, PASS), and four discrimination controls behave as the contract requires.

MANIFEST TREE HASH: sha256 of the text made of one line per file, sorted by relative posix path (byte order):
  "<sha256 hex of the file bytes>  <relative path>\\n"
This is exactly the output of `sha256sum` on the sorted list, so it can be reproduced without Python:
  cd docs/planning/G1/holdout-v1 && find . -type f ! -name MANIFEST.json ! -path '*/__pycache__/*' ! -name '*.pyc' \\
    | sed 's|^\\./||' | LC_ALL=C sort | xargs sha256sum | sha256sum
File bytes are hashed as stored; .gitattributes (* text eol=lf) keeps line endings LF on every checkout.
"""
import copy
import hashlib
import importlib.util
import json
import os
import posixpath
import re
import sys

sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))
G1 = os.path.dirname(HERE)
SCORE_PATH = os.path.join(G1, "fixture", "score.py")
SCHEMA_V1_PATH = os.path.join(G1, "fixture", "envelope.schema.v1.json")
GT_PATH = os.path.join(HERE, "ground-truth.json")
MANIFEST_PATH = os.path.join(HERE, "MANIFEST.json")
TSCONFIG = "src/tsconfig.json"
SOURCE_EXT = (".ts", ".tsx", ".js", ".py")
REQUIRED_CASES = ("path_alias", "all_star_import", "conditional_import", "decorator", "inheritance", "default_export",
                  "cross_package_collision", "negative_comment", "negative_string", "negative_shadow",
                  "unknown_dynamic", "unknown_http_cross_runtime", "omission_coverage", "reexport_barrel")
CENSUS = [re.compile(p) for p in (
    r"^\s*import\b", r"^\s*export\b.*\bfrom\s", r"^\s*from\s+\S+\s+import\b",
    r"\brequire\(", r"\bimport\(", r"\bimport_module\(", r"__import__\(")]


# ---------------------------------------------------------------- hashing
def sha256_file(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def fixture_files():
    """Relative posix paths of every file under holdout-v1/ except the manifest and bytecode caches."""
    out = []
    for root, dirs, files in os.walk(HERE):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for name in files:
            if name.endswith(".pyc"):
                continue
            rel = os.path.relpath(os.path.join(root, name), HERE).replace(os.sep, "/")
            if rel != "MANIFEST.json":
                out.append(rel)
    return sorted(out, key=lambda p: p.encode("utf-8"))


def manifest_tree_hash(file_hashes):
    text = "".join(f"{file_hashes[p]}  {p}\n" for p in sorted(file_hashes, key=lambda p: p.encode("utf-8")))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_score():
    spec = importlib.util.spec_from_file_location("g1_fixture_score", SCORE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------- source access and resolution
_cache = {}


def lines_of(rel):
    if rel not in _cache:
        with open(os.path.join(HERE, rel), "r", encoding="utf-8", newline="") as fh:
            _cache[rel] = fh.read().replace("\r\n", "\n").split("\n")
    return _cache[rel]


def line_text(rel, line):
    try:
        lines = lines_of(rel)
    except OSError:
        return None
    return lines[line - 1] if isinstance(line, int) and 1 <= line <= len(lines) else None


def exists(rel):
    return os.path.isfile(os.path.join(HERE, rel))


def resolve(spec, from_file):
    """Resolve an import specifier as written to a fixture file, or None (external or unresolvable).
    TS/JS: relative paths, then src/tsconfig.json paths (exact and prefix/* keys). Python: relative dots or dotted
    names under the source root src/."""
    if from_file.endswith(".py"):
        m = re.search(r"from\s+(\.*)([\w.]*)\s+import", spec) or re.search(r"import\s+()([\w.]+)", spec)
        if not m:
            return None
        dots, name = m.group(1), m.group(2)
        if dots:
            base = posixpath.dirname(from_file)
            for _ in range(len(dots) - 1):
                base = posixpath.dirname(base)
        else:
            base = "src"
        path = posixpath.join(base, name.replace(".", "/")) if name else base
        for cand in (path + ".py", path + "/__init__.py"):
            if exists(cand):
                return cand
        return None
    m = re.search(r"['\"`]([^'\"`]+)['\"`]", spec)
    if not m:
        return None
    s = m.group(1)
    bases = []
    if s.startswith("."):
        bases.append(posixpath.normpath(posixpath.join(posixpath.dirname(from_file), s)))
    else:
        with open(os.path.join(HERE, TSCONFIG), "r", encoding="utf-8") as fh:
            opts = json.load(fh)["compilerOptions"]
        root = posixpath.normpath(posixpath.join(posixpath.dirname(TSCONFIG), opts.get("baseUrl", ".")))
        for key, targets in opts.get("paths", {}).items():
            if key.endswith("/*") and s.startswith(key[:-1]):
                bases += [posixpath.join(root, t.replace("*", s[len(key) - 1:])) for t in targets]
            elif key == s:
                bases += [posixpath.join(root, t) for t in targets]
    for b in bases:
        for suf in ("", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx", "/index.js"):
            if exists(b + suf) and (b + suf).endswith(SOURCE_EXT):
                return b + suf
    return None


def module_of(node_id):
    return node_id.partition("::")[0]


# ---------------------------------------------------------------- checks
def check_manifest(fails, score_mod):
    if not os.path.isfile(MANIFEST_PATH):
        fails.append("MANIFEST.json missing")
        return None
    with open(MANIFEST_PATH, "r", encoding="utf-8") as fh:
        man = json.load(fh)
    listed = man.get("files", {})
    actual = {p: sha256_file(os.path.join(HERE, p)) for p in fixture_files()}
    for p in sorted(set(listed) | set(actual)):
        if p not in actual:
            fails.append(f"manifest: listed file missing on disk: {p}")
        elif p not in listed:
            fails.append(f"manifest: unlisted file on disk: {p}")
        elif listed[p] != actual[p]:
            fails.append(f"manifest: sha256 mismatch: {p}")
    th = manifest_tree_hash(actual)
    if man.get("tree_sha256") != th:
        fails.append(f"manifest: tree_sha256 {man.get('tree_sha256')} != computed {th}")
    if man.get("scoring_version") != "kawalys.graph.v1":
        fails.append("manifest: scoring_version must be kawalys.graph.v1")
    if man.get("freeze_date") != "2026-11-22":
        fails.append("manifest: freeze_date must be 2026-11-22")
    for key, path in (("scorer", SCORE_PATH), ("schema", SCHEMA_V1_PATH)):
        pin = man.get(key, {}).get("sha256")
        got = sha256_file(path)
        if pin != got:
            fails.append(f"manifest: {key} pin {pin} != {os.path.relpath(path, G1)} sha256 {got} (re-pin needs owner approval)")
    src_th = score_mod.tree_hash(HERE)
    if man.get("src_tree_sha256") != src_th:
        fails.append(f"manifest: src_tree_sha256 != computed {src_th}")
    if man.get("file_count") != len(actual):
        fails.append(f"manifest: file_count {man.get('file_count')} != {len(actual)}")
    return man


def check_ground_truth(gt, fails, score_mod):
    need = lambda cond, msg: None if cond else fails.append(msg)  # noqa: E731
    th = score_mod.tree_hash(HERE)
    need(gt["fixture"]["tree_sha256"] == th and gt["source"]["revision"] == th, f"src tree hash {th} differs from ground truth")
    src_files = [p for p in fixture_files() if p.startswith("src/")]
    need(30 <= len(src_files) <= 40, f"src/ holds {len(src_files)} files, want 30..40")
    sources = [p for p in src_files if p.endswith(SOURCE_EXT)]
    need(set(src_files) - set(sources) == {TSCONFIG}, "src/ may only hold source files plus src/tsconfig.json")
    nodes = {n["id"]: n for n in gt["nodes"]}
    need(len(nodes) == len(gt["nodes"]), "duplicate node ids")
    modules = {i for i, n in nodes.items() if n["kind"] == "module"}
    need(modules == set(sources), "module nodes differ from the source files on disk")
    need(gt["coverage"] == {"files_seen": len(sources), "files_total": len(sources)}, "coverage must be files_seen = files_total = source files")
    need(gt["external_refs"] == len(gt["external_imports"]), "external_refs must equal the number of external import statements")
    # nodes
    symbols_by_file = {}
    for nid, n in nodes.items():
        need(n["file"] == module_of(nid) and line_text(n["file"], n["line"]) is not None, f"node {nid}: bad file or line")
        if "::" in nid:
            sym = nid.partition("::")[2]
            tok = sym.split(".")[-1]
            txt = line_text(n["file"], n["line"]) or ""
            need(re.search(r"\b" + re.escape(tok) + r"\b", txt) is not None, f"node {nid}: line {n['line']} lacks {tok!r}: {txt.strip()}")
            if n["kind"] == "method":
                need(n["file"] + "::" + sym.rsplit(".", 1)[0] in nodes, f"node {nid}: method without its class node")
            symbols_by_file.setdefault(n["file"], []).append(n)
    # edges
    edges = gt["edges"]
    need(len({e["id"] for e in edges}) == len(edges), "duplicate edge ids")
    keys = [(e["type"], e["from"], e["to"], e["line"]) for e in edges if e["basis"] != "unknown"]
    need(len(keys) == len(set(keys)), "duplicate (type, from, to, line) keys")
    observed_imports = {(e["from"], e["to"]) for e in edges if e["type"] == "imports" and e["basis"] == "observed"}
    import_lines = {(e["file"], e["line"]): e for e in edges if e["type"] == "imports" and e["basis"] == "observed"}

    def enclosing(file, line, decorator):
        """Innermost listed symbol whose definition is before the line (methods nest in their class)."""
        if decorator:
            return file
        before = [n for n in symbols_by_file.get(file, []) if n["line"] < line]
        return max(before, key=lambda n: n["line"])["id"] if before else file

    contains_to = []
    for e in edges:
        tag = f"edge {e['id']} {e['type']} {e['from']} -> {e['to']} @ {e['file']}:{e['line']}"
        txt = line_text(e["file"], e["line"])
        need(txt is not None, f"{tag}: line out of range")
        txt = txt or ""
        need(e["evidence_token"] in txt, f"{tag}: line lacks evidence token {e['evidence_token']!r}: {txt.strip()}")
        need(e["from"] in nodes and module_of(e["from"]) == e["file"], f"{tag}: from must be a node in the edge's file (R7)")
        need(e["to"] is None or e["to"] in nodes, f"{tag}: to is not a node")
        need(e["basis"] in ("observed", "inferred", "unknown"), f"{tag}: bad basis")
        if e["type"] == "imports":
            need(e.get("form") == e.get("v1_form") and e.get("form") in ("import", "reexport", "require", "dynamic"),
                 f"{tag}: form and v1_form must agree")
        if e["basis"] == "unknown":
            need(e["to"] is None and e.get("target_hint"), f"{tag}: unknown needs to=null and target_hint (R4, R6)")
            others = [x["id"] for x in edges if x is not e and x["file"] == e["file"] and x["line"] == e["line"] and x["type"] != "contains"]
            need(not others, f"{tag}: unknown shares its file:line with {others} (R5 match would be ambiguous)")
            if e["type"] == "calls":
                need(e["from"] == enclosing(e["file"], e["line"], False), f"{tag}: from is not the enclosing symbol")
            else:
                need(e["from"] == e["file"], f"{tag}: an imports edge starts at the importing module")
            if e["type"] == "imports":
                need(resolve(e["evidence_token"], e["file"]) is None or e.get("form") == "dynamic",
                     f"{tag}: a resolvable non-dynamic specifier cannot be unknown")
            continue
        if e["type"] == "imports":
            spec = e.get("specifier", "")
            need(spec and spec in txt, f"{tag}: specifier {spec!r} not on the line")
            got = resolve(spec, e["file"])
            need(got == e["to"], f"{tag}: specifier {spec!r} resolves to {got}, ground truth says {e['to']}")
            need(e["from"] == e["file"], f"{tag}: an imports edge starts at the importing module")
        elif e["type"] == "calls":
            name = e.get("local_name") or e["to"].partition("::")[2].split(".")[-1]
            need(re.search(r"\b" + re.escape(name) + r"\b", txt) is not None, f"{tag}: line does not name the callee {name!r}")
            deco = e["evidence_token"].startswith("@")
            need(e["from"] == enclosing(e["file"], e["line"], deco),
                 f"{tag}: from should be {enclosing(e['file'], e['line'], deco)} (innermost enclosing symbol)")
            if e.get("local_name"):
                bind = [x for (f, ln), x in import_lines.items() if f == e["file"] and e["local_name"] in (line_text(f, ln) or "")]
                need(any(x["to"] == module_of(e["to"]) for x in bind), f"{tag}: local name {e['local_name']!r} is not bound by an import of the target module")
            if e["basis"] == "observed":
                need((e["file"], module_of(e["to"])) in observed_imports,
                     f"{tag}: observed call but the caller does not import the target module (receiver typing would be inferred)")
            if e["evidence_token"].startswith("super"):
                cls_line = line_text(e["file"], nodes[e["from"].rsplit(".", 1)[0]]["line"]) or ""
                base = e["to"].partition("::")[2].split(".")[0]
                need(re.search(r"(extends\s+|\()" + re.escape(base) + r"\b", cls_line) is not None,
                     f"{tag}: super call but the enclosing class does not name {base} as its base")
        elif e["type"] == "contains":
            n = nodes[e["to"]]
            need(e["line"] == n["line"] and e.get("line_source") == "derived", f"{tag}: contains line must be the definition line, derived (R7)")
            sym = e["to"].partition("::")[2]
            parent = e["file"] + "::" + sym.rsplit(".", 1)[0] if "." in sym else e["file"]
            need(e["from"] == parent, f"{tag}: contains parent should be {parent}")
            contains_to.append(e["to"])
    need(sorted(contains_to) == sorted(i for i in nodes if "::" in i), "every symbol node needs exactly one contains edge")
    # negatives
    neg_ids = [n["id"] for n in gt["negatives"]]
    need(len(neg_ids) == len(set(neg_ids)), "duplicate negative ids")
    truth = {(e["type"], e["from"], e["to"]) for e in edges if e["basis"] != "unknown"}
    truth_mod = {(e["type"], e["from"], module_of(e["to"])) for e in edges if e["basis"] != "unknown"}
    for n in gt["negatives"]:
        tag = f"negative {n['id']}"
        need(n["from"] == "*" or n["from"] in nodes, f"{tag}: unknown from")
        need(module_of(n["to"]) in modules, f"{tag}: to-module not in the fixture")
        need((n["type"], n["from"], n["to"]) not in truth, f"{tag} is also a ground-truth edge")
        if n["type"] == "imports":
            need(not any(t[0] == "imports" and t[2] == module_of(n["to"]) and n["from"] in ("*", t[1]) for t in truth_mod),
                 f"{tag}: a ground-truth imports edge targets the negative's module")
        if n["from"] == "*" and n["type"] == "calls":
            need(not any(t[0] == "calls" and t[2] == n["to"] for t in truth), f"{tag}: a ground-truth call targets it")
        ev = n.get("evidence")
        if ev:
            txt = line_text(ev["file"], ev["line"]) or ""
            need(ev["token"] in txt, f"{tag}: evidence line lacks {ev['token']!r}")
            need(n["from"] == "*" or module_of(n["from"]) == ev["file"], f"{tag}: evidence file differs from the from-module")
        if n.get("specifier"):
            got = resolve(n["specifier"], n["evidence"]["file"])
            need(got == module_of(n["to"]), f"{tag}: specifier {n['specifier']!r} would resolve to {got}, not {n['to']} (it must look linked)")
    # external imports and census
    ext = set()
    for x in gt["external_imports"]:
        txt = line_text(x["file"], x["line"]) or ""
        need(x["token"] in txt, f"external {x['file']}:{x['line']} lacks {x['token']!r}")
        need(resolve(x["token"], x["file"]) is None, f"external {x['file']}:{x['line']} resolves inside the fixture")
        ext.add((x["file"], x["line"]))
    cited = {(e["file"], e["line"]) for e in edges if e["type"] == "imports"}
    neg_lines = {(n["evidence"]["file"], n["evidence"]["line"]) for n in gt["negatives"] if n.get("evidence")}
    for rel in sources:
        for i, txt in enumerate(lines_of(rel), 1):
            if any(rx.search(txt) for rx in CENSUS):
                need((rel, i) in cited or (rel, i) in ext or (rel, i) in neg_lines, f"census: unaccounted import-like line {rel}:{i}: {txt.strip()}")
    # coverage cases
    for c in gt.get("coverage_cases", []):
        need(line_text(c["file"], c["line"]) is not None, f"coverage case {c['case']!r}: {c['file']}:{c['line']} missing")
    seen = set()
    for x in edges + gt["negatives"]:
        seen.update(x.get("case", []))
    if gt.get("coverage_cases"):
        seen.add("omission_coverage")
    for case in REQUIRED_CASES:
        need(case in seen, f"required case {case!r} is not exercised")
    return {"sources": len(sources), "src_files": len(src_files)}


def check_scoring(gt, fails, score_mod):
    need = lambda cond, msg: None if cond else fails.append(msg)  # noqa: E731
    r = score_mod.run_score(GT_PATH, GT_PATH, quiet=True)
    n_edges = sum(1 for e in gt["edges"] if e["basis"] != "unknown")
    tot = {k: sum(v[k] for v in r["table"].values()) for k in ("expected", "tp", "fn", "fp")}
    need(r.get("contract") == "v1" and not r["schema_errors"] and r["contract_errors"] == [], "self-score: not a clean v1 envelope")
    need(tot == {"expected": n_edges, "tp": n_edges, "fn": 0, "fp": 0}, f"self-score: {tot}, want {n_edges} matched")
    need(r["line_provenance"] == {"exact": n_edges, "missing": 0, "off_by_n": []}, "self-score: lines not all exact")
    need(all(u["status"] == "marked_unknown" for u in r["unknown"]) and len(r["unknown"]) == sum(1 for e in gt["edges"] if e["basis"] == "unknown"),
         "self-score: unknowns not all marked_unknown")
    for key in ("false_observed", "false_inferred", "overclaimed", "understated", "invalid_claims", "surplus_statements",
                "derived", "form_mismatch", "type_mismatch", "negatives_hit"):
        need(not r[key], f"self-score: unexpected {key}: {r[key][:2]}")
    need(r["verdict"]["result"] == "PASS", "self-score verdict must be PASS")

    # discrimination controls (in memory; the scorer must separate truth from the traps on this fixture)
    def run(mutate):
        env = copy.deepcopy(gt)
        mutate(env)
        res = score_mod.score_v1(env, gt)
        return score_mod.apply_v1_gate(res, score_mod.validate_schema(env, score_mod.load_json(SCHEMA_V1_PATH)), score_mod.contract_errors(env))

    def edge(env, frm, to):
        return next(e for e in env["edges"] if e["from"] == frm and e["to"] == to)

    L, A, I, V = "src/packages/ledger/src/", "src/packages/atlas/src/", "src/ingest/", "src/vault/"
    c1 = run(lambda env: edge(env, V + "store.py::persist", V + "models.py::Record.save").update(basis="observed"))
    need(len(c1["overclaimed"]) == 1 and c1["verdict"]["result"] == "FAIL", "control 1: an inferred truth labelled observed must FAIL (R4)")
    c2 = run(lambda env: env["edges"].append({"type": "imports", "form": "dynamic", "from": A + "App.tsx", "to": A + "views/monthly.ts",
                                              "file": A + "App.tsx", "line": 8, "basis": "observed"}))
    need(c2["negatives_hit"] and next(u for u in c2["unknown"] if u["line"] == 8)["status"] == "claimed_observed"
         and c2["verdict"]["result"] == "FAIL", "control 2: resolving the literal dynamic import must claim the unknown and FAIL (R5)")
    c3 = run(lambda env: env["edges"].append({"type": "calls", "from": V + "store.py::persist", "to": I + "models.py::Record",
                                              "file": V + "store.py", "line": 9, "basis": "inferred"}))
    need(c3["negatives_hit"] and c3["verdict"]["result"] == "FAIL", "control 3: the cross-package Record collision must hit a negative and FAIL")
    c4 = run(lambda env: env["edges"].append({"type": "imports", "form": "import", "from": A + "LedgerPanel.tsx", "to": L + "money.ts",
                                              "file": A + "LedgerPanel.tsx", "line": 3, "basis": "observed", "via": "barrel"}))
    need(len(c4["derived"]) == 1 and not c4["false_observed"] and c4["verdict"]["result"] == "PASS",
         "control 4: money.ts through the @ledger barrel must be derived, never a false edge (R2)")
    return r


def main():
    fails = []
    score_mod = load_score()
    with open(GT_PATH, "r", encoding="utf-8") as fh:
        gt = json.load(fh)
    man = check_manifest(fails, score_mod)
    info = check_ground_truth(gt, fails, score_mod)
    r = check_scoring(gt, fails, score_mod)
    by = {}
    for e in gt["edges"]:
        by[(e["type"], e["basis"])] = by.get((e["type"], e["basis"]), 0) + 1
    print(f"holdout-v1: src files={info['src_files']} (source modules={info['sources']}) nodes={len(gt['nodes'])} "
          f"edges={len(gt['edges'])} negatives={len(gt['negatives'])} external_imports={len(gt['external_imports'])}")
    print("edges by (type, basis): " + ", ".join(f"{k[0]}/{k[1]}={v}" for k, v in sorted(by.items())))
    tot = {k: sum(v[k] for v in r["table"].values()) for k in ("expected", "tp", "fn", "fp")}
    print(f"self-score with fixture/score.py (kawalys.graph.v1): tp={tot['tp']}/{tot['expected']} fn={tot['fn']} fp={tot['fp']} "
          f"unknown marked={sum(1 for u in r['unknown'] if u['status'] == 'marked_unknown')}/{len(r['unknown'])} verdict={r['verdict']['result']}")
    if man:
        print(f"manifest tree sha256: {man.get('tree_sha256')} ({man.get('file_count')} files); src tree sha256: {man.get('src_tree_sha256')}")
    if fails:
        for f in fails:
            print("[FAIL] " + f)
        print(f"HOLDOUT VERIFY FAILED ({len(fails)} problems)")
        return 1
    print("HOLDOUT VERIFY PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
