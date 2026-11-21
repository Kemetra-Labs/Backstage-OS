#!/usr/bin/env python3
"""G1-01 scorer for the Kawalys graph evidence envelope (stdlib only, ASCII output only).

Usage:
  python score.py <normalized-envelope.json> [--ground-truth ground-truth.json] [--json out.json]
  python score.py --self-check
  python score.py --tree-hash

Reports COUNTS ONLY (never ratios). The only verdict is the criterion
"no false observed edges": any observed engine edge that is not in the ground truth is a FAIL.

ID NORMALISATION RULE (applied to every `from`, `to` and `file` of engine edges)
  1. Ids are relative to the fixture directory (src/web/orders.ts, src/svc/service.py).
     Backslashes become '/', leading './' is dropped. Symbols are written path::Symbol or
     path::Class.method; the part after '::' is compared exactly (case-sensitive).
  2. The path part is compared case-insensitively and resolved to a fixture module:
     it is tried as-is and with suffixes .ts .tsx .js .py /index.ts /index.tsx /index.js /__init__.py.
     A '.js' path is also tried as .ts and .tsx (TypeScript ESM style).
  3. A dotted Python module (svc.service) maps to path form (svc/service), tried bare and under
     the Python source root src/ (so svc.service resolves to src/svc/service.py).
  4. A path that does not resolve to a fixture module is EXTERNAL (react, requests, ...).
SCOPE RULES
  * Edges whose from/to is external are ignored and only counted (external_ignored).
  * imports/calls whose from-module equals the to-module are out of scope (intrafile_ignored).
  * contains edges to a symbol that is not a ground-truth node are ignored (unlisted_contains_ignored).
  * Engine edges with basis unknown, or with a null target, are never false edges.
  * A `reexports` edge is the only credited form of `export {x} from` and `export * from`.
    An engine edge of another type at the same from/to-module/file/line is a type_mismatch
    (listed, not an FP; the reexports edge counts as missed).
  * Calls through a barrel: an engine `to` of the form barrel::Name is resolved to the defining
    symbol through the ground-truth reexports (alias_resolved). Imports are NOT resolved through
    barrels: an imports edge must target the literal specifier's file.
NEGATIVES: an engine edge with basis observed or inferred that matches (type, from, to) of a
  negative is a hit (from '*' matches any). basis unknown is never a hit. Hits are counted per
  engine edge; if one edge matches several negatives, all their ids are listed on that one hit.
UNKNOWN MATCH RULE: an engine edge matches a ground-truth unknown edge when type and file are equal
  and (line is equal, or the engine line is null and `from` is equal). Result per unknown edge:
  claimed_observed (any matching edge with basis observed/inferred; bad), else marked_unknown
  (a matching edge with basis unknown), else omission (an omissions[].what containing the file
  path), else silent.

CONTRACT V1 (kawalys.graph.v1, ../contract-v1/CONTRACT-V1.md; selected by the envelope's envelope_version,
or forced with --contract v1). Everything above stays the v0 behaviour and is unchanged so the stored v0
results reproduce byte for byte (--contract v0). v1 differences, each tied to a contract rule:
  R1  An imports edge is scored at module level. An engine edge to path::Symbol is folded onto the
      path (the symbol is just names[]), counted as names_folded and never as a separate false edge.
  R2  An engine imports edge that resolves THROUGH a barrel (its file+line is a ground-truth import of a
      barrel that re-exports the target) is `derived`: listed, never a false edge.
  R3  Re-exports are imports edges (form reexport). Legacy v0 type `reexports` is read as imports. `form`
      is not part of the match key; a differing form is reported (form_mismatch), not failed.
  R4  Ground-truth edges flagged v1_basis=inferred must not be labelled observed: that is `overclaimed`
      and counts toward the hard fail. Labelling an observed truth as inferred is `understated`
      (reported only).
  R5  An unknown matches on file + line (or from, when the engine line is null) regardless of edge type.
      An engine edge to an external package never claims the unknown target.
  R7  contract_errors() reports envelope-shape rules the subset schema validator cannot express.
  R8  Hard fail = false observed edges + overclaimed + negatives hit. Reported, not a gate: false
      inferred, derived, understated, unknown coverage, per-type and per-language coverage, files seen
      vs total and external_refs. Counts only, never percentages.
"""
import argparse
import copy
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
GT_PATH = os.path.join(HERE, "ground-truth.json")
ENV_GT_PATH = os.path.join(HERE, "ground-truth.envelope.json")
SCHEMA_PATH = os.path.join(HERE, "envelope.schema.json")
SCHEMA_V1_PATH = os.path.join(HERE, "envelope.schema.v1.json")
MUTATED_PATH = os.path.join(HERE, "test", "mutated.envelope.json")
EDGE_TYPES = ("imports", "calls", "reexports", "contains")
EDGE_TYPES_V1 = ("imports", "calls", "contains")
V0, V1 = "kawalys.graph.v0", "kawalys.graph.v1"
EXT_LANG = {".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".py": "python"}
SUFFIXES = ("", ".ts", ".tsx", ".js", ".py", "/index.ts", "/index.tsx", "/index.js", "/__init__.py")


# ---------------------------------------------------------------- pinning
def tree_hash(fixture_dir=HERE):
    """sha256 over sorted relative paths (posix, relative to the fixture dir, so 'src/...').
    Per file: path utf-8, NUL, file bytes with CRLF turned into LF, NUL."""
    src = os.path.join(fixture_dir, "src")
    entries = []
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for name in files:
            if name.endswith(".pyc"):
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, fixture_dir).replace(os.sep, "/")
            entries.append((rel, full))
    entries.sort()
    digest = hashlib.sha256()
    for rel, full in entries:
        with open(full, "rb") as fh:
            data = fh.read().replace(b"\r\n", b"\n")
        digest.update(rel.encode("utf-8") + b"\0" + data + b"\0")
    return digest.hexdigest()


# ---------------------------------------------------------------- tiny schema validator
_TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
}


def validate_schema(inst, schema, path="$", errs=None):
    """Subset validator: type (also lists), enum, const, required, properties, items, pattern."""
    errs = [] if errs is None else errs
    t = schema.get("type")
    if t is not None:
        names = t if isinstance(t, list) else [t]
        if not any(_TYPES[n](inst) for n in names):
            errs.append(f"{path}: expected type {names}, got {type(inst).__name__}")
            return errs
    if "const" in schema and inst != schema["const"]:
        errs.append(f"{path}: expected const {schema['const']!r}, got {inst!r}")
    if "enum" in schema and inst not in schema["enum"]:
        errs.append(f"{path}: {inst!r} not in enum {schema['enum']}")
    if isinstance(inst, str) and "pattern" in schema and not re.search(schema["pattern"], inst):
        errs.append(f"{path}: {inst!r} does not match pattern")
    if isinstance(inst, dict):
        for key in schema.get("required", []):
            if key not in inst:
                errs.append(f"{path}: missing required key {key!r}")
        for key, sub in schema.get("properties", {}).items():
            if key in inst:
                validate_schema(inst[key], sub, f"{path}.{key}", errs)
    if isinstance(inst, list) and "items" in schema:
        for idx, item in enumerate(inst):
            validate_schema(item, schema["items"], f"{path}[{idx}]", errs)
    return errs


# ---------------------------------------------------------------- normalisation
def module_of(node_id):
    return node_id.partition("::")[0]


class Resolver:
    def __init__(self, module_ids):
        self.lower = {m.lower(): m for m in module_ids}

    def module(self, path):
        if not isinstance(path, str):
            return None
        p = path.strip().replace("\\", "/")
        while p.startswith("./"):
            p = p[2:]
        ext = os.path.splitext(p)[1].lower()
        cands = [p]
        if "/" not in p and "." in p and ext not in EXT_LANG:
            d = p.replace(".", "/")
            cands = [d, "src/" + d]
        elif ext == ".js":
            cands = [p, p[:-3] + ".ts", p[:-3] + ".tsx"]
        for cand in cands:
            for suf in SUFFIXES:
                hit = self.lower.get((cand + suf).lower())
                if hit:
                    return hit
        return None

    def norm(self, node_id):
        """Canonical id or None when null/external."""
        if node_id is None:
            return None
        path, sep, sym = node_id.partition("::")
        mod = self.module(path)
        if mod is None:
            return None
        return mod + (sep + sym if sep else "")


def build_alias(gt):
    """barrel::Name -> defining symbol, from ground-truth reexports edges."""
    alias = {}
    node_ids = [n["id"] for n in gt["nodes"]]
    for e in gt["edges"]:
        if e["type"] != "reexports" or e["basis"] != "observed":
            continue
        barrel, target = e["from"], e["to"]
        if "::" in target:
            alias[barrel + "::" + target.partition("::")[2]] = target
        else:
            for nid in node_ids:
                if module_of(nid) == target and "::" in nid:
                    alias[barrel + "::" + nid.partition("::")[2]] = nid
    return alias


# ---------------------------------------------------------------- scoring
def engine_languages(env):
    langs = {}
    for n in env.get("nodes", []):
        ref = n.get("file") or n.get("id") or ""
        ext = os.path.splitext(module_of(ref))[1].lower()
        lang = EXT_LANG.get(ext)
        if lang:
            langs[lang] = langs.get(lang, 0) + 1
    return langs


def _edge_str(e):
    return f"{e.get('type')} {e.get('from')} -> {e.get('to')} @ {e.get('file')}:{e.get('line')} [{e.get('basis')}]"


def score(env, gt):
    res = Resolver([n["id"] for n in gt["nodes"] if n["kind"] == "module"])
    node_ids = {n["id"] for n in gt["nodes"]}
    alias = build_alias(gt)
    gt_obs = [e for e in gt["edges"] if e["basis"] == "observed"]
    gt_unknown = [e for e in gt["edges"] if e["basis"] == "unknown"]
    gt_by_key = {(e["type"], e["from"], e["to"]): e for e in gt_obs}
    counters = {"external_ignored": 0, "null_target_ignored": 0, "intrafile_ignored": 0,
                "unlisted_contains_ignored": 0, "duplicate_ignored": 0, "alias_resolved": 0,
                "engine_unknown_edges": 0}
    matched, extras, resolved = {}, [], []
    engine_edges = env.get("edges", [])
    for e in engine_edges:
        if e.get("basis") == "unknown":
            counters["engine_unknown_edges"] += 1
            continue
        f = res.norm(e.get("from"))
        t = res.norm(e.get("to"))
        if e.get("to") is None:
            counters["null_target_ignored"] += 1
            continue
        if f is None or t is None:
            counters["external_ignored"] += 1
            continue
        if t in alias:
            t = alias[t]
            counters["alias_resolved"] += 1
        resolved.append((e, f, t))
        etype = e.get("type")
        if etype in ("imports", "calls") and module_of(f) == module_of(t):
            counters["intrafile_ignored"] += 1
            continue
        key = (etype, f, t)
        if etype == "contains" and key not in gt_by_key and t not in node_ids:
            counters["unlisted_contains_ignored"] += 1
            continue
        if key in gt_by_key:
            if key in matched:
                counters["duplicate_ignored"] += 1
            else:
                matched[key] = e
        else:
            extras.append((e, f, t))
    # type mismatch (e.g. imports where reexports was expected)
    type_mismatch = []
    unmatched_gt = [g for k, g in gt_by_key.items() if k not in matched]
    for item in list(extras):
        e, f, t = item
        efile = res.module(e.get("file")) if e.get("file") else None
        for g in unmatched_gt:
            if (g["type"] != e.get("type") and g["from"] == f and module_of(g["to"]) == module_of(t)
                    and g["file"] == efile and g["line"] == e.get("line")):
                type_mismatch.append({"engine": _edge_str(e), "expected_type": g["type"], "gt_edge": g["id"]})
                extras.remove(item)
                break
    # per-type table
    table = {}
    for ty in EDGE_TYPES:
        exp = [k for k in gt_by_key if k[0] == ty]
        tp = [k for k in exp if k in matched]
        fp = [x for x in extras if x[0].get("type") == ty]
        table[ty] = {"expected": len(exp), "tp": len(tp), "fn": len(exp) - len(tp), "fp": len(fp)}
    missed = [gt_by_key[k]["id"] + " " + " ".join(k) for k in gt_by_key if k not in matched]
    false_observed = [_edge_str(x[0]) for x in extras if x[0].get("basis") == "observed"]
    extra_inferred = [_edge_str(x[0]) for x in extras if x[0].get("basis") != "observed"]
    # negatives
    neg_hits = []
    for e, f, t in resolved:
        hit = [n for n in gt["negatives"]
               if e.get("type") == n["type"] and (n["from"] == "*" or f == n["from"]) and t == res.norm(n["to"])]
        if hit:
            neg_hits.append({"negatives": [n["id"] for n in hit], "reason": hit[0]["reason"], "engine": _edge_str(e)})
    # line provenance
    exact, missing, off = 0, 0, []
    for k, e in matched.items():
        g = gt_by_key[k]
        if e.get("line") is None:
            missing += 1
        elif e["line"] == g["line"]:
            exact += 1
        else:
            off.append({"edge": g["id"], "expected": g["line"], "got": e["line"], "off_by": e["line"] - g["line"]})
    # unknown handling
    unknown = []
    omissions = env.get("omissions", [])
    for u in gt_unknown:
        cands = []
        for e in engine_edges:
            if e.get("type") != u["type"] or not e.get("file") or res.module(e["file"]) != u["file"]:
                continue
            same_line = e.get("line") == u["line"]
            same_from = e.get("line") is None and res.norm(e.get("from")) == u["from"]
            if same_line or same_from:
                cands.append(e)
        if any(c.get("basis") in ("observed", "inferred") for c in cands):
            status = "claimed_observed"
        elif cands:
            status = "marked_unknown"
        elif any(u["file"].lower() in str(o.get("what", "")).lower() for o in omissions):
            status = "omission"
        else:
            status = "silent"
        unknown.append({"edge": u["id"], "type": u["type"], "file": u["file"], "line": u["line"], "status": status})
    langs = engine_languages(env)
    zero = [lang for lang in gt["fixture"]["languages"] if langs.get(lang, 0) == 0]
    return {
        "table": table, "missed": missed, "false_observed": false_observed,
        "extra_inferred": extra_inferred, "type_mismatch": type_mismatch,
        "negatives_hit": neg_hits, "negatives_total": len(gt["negatives"]),
        "line_provenance": {"exact": exact, "missing": missing, "off_by_n": off},
        "unknown": unknown, "languages_zero_nodes": zero, "engine_node_counts": langs,
        "ignored": counters,
        "verdict": {"criterion": "no_false_observed_edges", "false_observed": len(false_observed),
                    "result": "PASS" if not false_observed else "FAIL"},
    }


# ---------------------------------------------------------------- contract v1
def gt_v1_edges(gt):
    """Ground-truth edges as seen under kawalys.graph.v1: re-exports become imports with form reexport (R3),
    imports target the literal file (R1), receiver-typed calls are inferred (R4). Reads the additive
    v1_form / v1_basis keys; the v0 fields of ground-truth.json are not modified."""
    out = []
    for e in gt["edges"]:
        d = dict(e)
        d["basis"] = e.get("v1_basis", e["basis"])
        if e["type"] == "reexports":
            d["type"], d["form"] = "imports", e.get("v1_form", "reexport")
        elif e["type"] == "imports":
            d["form"] = e.get("v1_form", "import")
        if d["type"] == "imports" and d["to"] is not None:
            d["to"] = module_of(d["to"])
        out.append(d)
    return out


def contract_errors(env):
    """Envelope rules the subset schema validator cannot express (R3, R4, R6, R7). Reported, not scored."""
    errs = []
    for i, e in enumerate(env.get("edges", [])):
        tag = f"edges[{i}] {e.get('type')} {e.get('from')}"
        basis = e.get("basis")
        if basis in ("observed", "inferred") and not isinstance(e.get("line"), int):
            errs.append(f"{tag}: {basis} edge needs an integer line (R7)")
        if e.get("type") == "imports" and not e.get("form"):
            errs.append(f"{tag}: imports edge needs form (R3)")
        if e.get("type") == "contains" and e.get("line_source") != "derived":
            errs.append(f"{tag}: contains edge needs line_source=derived (R7)")
        if e.get("to") is None and basis != "unknown":
            errs.append(f"{tag}: null target is only valid for basis unknown (R4, R6)")
        if basis == "unknown" and e.get("to") is None and not e.get("target_hint"):
            errs.append(f"{tag}: unknown edge needs target_hint (R6)")
    return errs


def score_v1(env, gt):
    res = Resolver([n["id"] for n in gt["nodes"] if n["kind"] == "module"])
    node_ids = {n["id"] for n in gt["nodes"]}
    alias = build_alias(gt)
    all_gt = gt_v1_edges(gt)
    gt_edges = [e for e in all_gt if e["basis"] in ("observed", "inferred")]
    gt_unknown = [e for e in all_gt if e["basis"] == "unknown"]
    gt_by_key = {(e["type"], e["from"], e["to"]): e for e in gt_edges}
    # R2: (importing module, line) -> barrel it imports, and the modules each barrel re-exports
    import_at = {(e["from"], e["line"]): e["to"] for e in gt_edges if e["type"] == "imports" and e.get("form") != "reexport"}
    reexports = {}
    for e in gt_edges:
        if e["type"] == "imports" and e.get("form") == "reexport":
            reexports.setdefault(e["from"], set()).add(e["to"])
    counters = {"external_ignored": 0, "null_target_ignored": 0, "intrafile_ignored": 0,
                "unlisted_contains_ignored": 0, "duplicate_ignored": 0, "alias_resolved": 0,
                "engine_unknown_edges": 0, "names_folded": 0}
    matched, extras, resolved, derived = {}, [], [], []
    engine_edges = env.get("edges", [])
    for e in engine_edges:
        if e.get("basis") == "unknown":
            counters["engine_unknown_edges"] += 1
            continue
        if e.get("to") is None:
            counters["null_target_ignored"] += 1
            continue
        f, t = res.norm(e.get("from")), res.norm(e.get("to"))
        if f is None or t is None:
            counters["external_ignored"] += 1
            continue
        etype = "imports" if e.get("type") == "reexports" else e.get("type")
        ne = dict(e, type=etype)
        if e.get("type") == "reexports" and not e.get("form"):
            ne["form"] = "reexport"
        if etype == "calls" and t in alias:
            t = alias[t]
            counters["alias_resolved"] += 1
        if etype == "imports":
            if "::" in t:
                counters["names_folded"] += 1
            f, t = module_of(f), module_of(t)
        resolved.append((ne, f, t))
        if etype in ("imports", "calls") and module_of(f) == module_of(t):
            counters["intrafile_ignored"] += 1
            continue
        key = (etype, f, t)
        if etype == "contains" and key not in gt_by_key and t not in node_ids:
            counters["unlisted_contains_ignored"] += 1
            continue
        if key in gt_by_key:
            if key in matched:
                counters["duplicate_ignored"] += 1
            else:
                matched[key] = ne
        elif etype == "imports" and t in reexports.get(import_at.get((f, ne.get("line"))), ()):
            derived.append(_edge_str(ne) + " via barrel")
        else:
            extras.append((ne, f, t))
    overclaimed, understated, form_mismatch = [], [], []
    for k, e in matched.items():
        g = gt_by_key[k]
        if g["basis"] == "inferred" and e.get("basis") == "observed":
            overclaimed.append(f"{g['id']} {_edge_str(e)}")
        elif g["basis"] == "observed" and e.get("basis") == "inferred":
            understated.append(f"{g['id']} {_edge_str(e)}")
        if g.get("form") and e.get("form") and g["form"] != e["form"]:
            form_mismatch.append(f"{g['id']} expected form {g['form']}, got {e['form']}")
    type_mismatch = []
    unmatched_gt = [g for k, g in gt_by_key.items() if k not in matched]
    for item in list(extras):
        e, f, t = item
        efile = res.module(e.get("file")) if e.get("file") else None
        for g in unmatched_gt:
            if (g["type"] != e.get("type") and g["from"] == f and module_of(g["to"]) == module_of(t)
                    and g["file"] == efile and g["line"] == e.get("line")):
                type_mismatch.append({"engine": _edge_str(e), "expected_type": g["type"], "gt_edge": g["id"]})
                extras.remove(item)
                break
    table = {}
    for ty in EDGE_TYPES_V1:
        exp = [k for k in gt_by_key if k[0] == ty]
        tp = [k for k in exp if k in matched]
        fp = [x for x in extras if x[0].get("type") == ty]
        table[ty] = {"expected": len(exp), "tp": len(tp), "fn": len(exp) - len(tp), "fp": len(fp)}
    lang_cov = {}
    for k, g in gt_by_key.items():
        lang = EXT_LANG.get(os.path.splitext(module_of(g["from"]))[1].lower(), "other")
        d = lang_cov.setdefault(lang, {"expected": 0, "tp": 0})
        d["expected"] += 1
        d["tp"] += 1 if k in matched else 0
    missed = [gt_by_key[k]["id"] + " " + " ".join(k) for k in gt_by_key if k not in matched]
    false_observed = [_edge_str(x[0]) for x in extras if x[0].get("basis") == "observed"]
    false_inferred = [_edge_str(x[0]) for x in extras if x[0].get("basis") != "observed"]
    neg_hits = []
    for e, f, t in resolved:
        hit = []
        for n in gt["negatives"]:
            nto = res.norm(n["to"])
            to_ok = t == nto or (e.get("type") == "imports" and nto is not None and module_of(nto) == t)
            if e.get("type") == n["type"] and (n["from"] == "*" or f == n["from"]) and to_ok:
                hit.append(n)
        if hit:
            neg_hits.append({"negatives": [n["id"] for n in hit], "reason": hit[0]["reason"], "engine": _edge_str(e)})
    exact, missing, off = 0, 0, []
    for k, e in matched.items():
        g = gt_by_key[k]
        if e.get("line") is None:
            missing += 1
        elif e["line"] == g["line"]:
            exact += 1
        else:
            off.append({"edge": g["id"], "expected": g["line"], "got": e["line"], "off_by": e["line"] - g["line"]})
    unknown = []
    omissions = env.get("omissions", [])
    for u in gt_unknown:
        cands = []
        for e in engine_edges:
            if not e.get("file") or res.module(e["file"]) != u["file"] or e.get("type") == "contains":
                continue  # contains is structure, never a relation to the unknown target
            if e.get("to") is not None and res.norm(e["to"]) is None:
                continue  # R5: an edge to an external package does not claim the unknown target
            if e.get("line") == u["line"] or (e.get("line") is None and res.norm(e.get("from")) == u["from"]):
                cands.append(e)
        if any(c.get("basis") in ("observed", "inferred") for c in cands):
            status = "claimed_observed"
        elif cands:
            status = "marked_unknown"
        elif any(u["file"].lower() in str(o.get("what", "")).lower() for o in omissions):
            status = "omission"
        else:
            status = "silent"
        unknown.append({"edge": u["id"], "type": u["type"], "file": u["file"], "line": u["line"], "status": status})
    langs = engine_languages(env)
    hard = len(false_observed) + len(overclaimed) + len(neg_hits)
    return {
        "contract": "v1", "table": table, "missed": missed, "false_observed": false_observed,
        "false_inferred": false_inferred, "overclaimed": overclaimed, "understated": understated,
        "derived": derived, "form_mismatch": form_mismatch, "type_mismatch": type_mismatch,
        "negatives_hit": neg_hits, "negatives_total": len(gt["negatives"]),
        "line_provenance": {"exact": exact, "missing": missing, "off_by_n": off},
        "unknown": unknown, "languages_zero_nodes": [lg for lg in gt["fixture"]["languages"] if langs.get(lg, 0) == 0],
        "engine_node_counts": langs, "coverage_by_language": lang_cov,
        "files": env.get("coverage"), "external_refs": env.get("external_refs"), "ignored": counters,
        "verdict": {"criterion": "no_false_observed_overclaimed_or_negative_hits", "false_observed": len(false_observed),
                    "overclaimed": len(overclaimed), "negatives_hit": len(neg_hits), "result": "PASS" if not hard else "FAIL"},
    }


def render_v1(result, engine, schema_errs, contract_errs):
    out = ["G1 SCORE REPORT v1 (counts only)", f"engine: {engine.get('name')} {engine.get('version')}",
           "envelope schema: " + ("VALID" if not schema_errs else f"INVALID ({len(schema_errs)} errors)")]
    out += ["  schema error: " + x for x in schema_errs[:10]]
    out.append("contract errors: " + (str(len(contract_errs)) if contract_errs else "none"))
    out += ["  " + x for x in contract_errs[:10]]
    out += ["", "Edge type   expected    TP    FN    FP", "----------  --------  ----  ----  ----"]
    tot = {"expected": 0, "tp": 0, "fn": 0, "fp": 0}
    for ty in EDGE_TYPES_V1:
        r = result["table"][ty]
        out.append(f"{ty:<10}  {r['expected']:>8}  {r['tp']:>4}  {r['fn']:>4}  {r['fp']:>4}")
        for k in tot:
            tot[k] += r[k]
    out.append(f"{'TOTAL':<10}  {tot['expected']:>8}  {tot['tp']:>4}  {tot['fn']:>4}  {tot['fp']:>4}")
    sections = (("Missed (FN)", "missed"), ("HARD: false observed edges", "false_observed"),
                ("HARD: overclaimed (observed label on an inferred truth)", "overclaimed"),
                ("Reported: false inferred edges", "false_inferred"),
                ("Reported: understated (inferred label on an observed truth)", "understated"),
                ("Reported: derived through a barrel (R2)", "derived"),
                ("Reported: form mismatches", "form_mismatch"))
    for title, key in sections:
        out.append(f"{title}: {len(result[key])}")
        out += ["  " + x for x in result[key]]
    out.append(f"Reported: type mismatches: {len(result['type_mismatch'])}")
    out += [f"  {m['engine']} (expected type {m['expected_type']}, {m['gt_edge']})" for m in result["type_mismatch"]]
    out.append(f"HARD: negatives hit: {len(result['negatives_hit'])}; negatives defined: {result['negatives_total']}")
    out += [f"  {'+'.join(h['negatives'])}: {h['engine']} ({h['reason']})" for h in result["negatives_hit"]]
    lp = result["line_provenance"]
    out.append(f"Line provenance of matched edges: exact={lp['exact']} off_by_n={len(lp['off_by_n'])} missing={lp['missing']}")
    out += [f"  {o['edge']}: expected {o['expected']} got {o['got']} (off by {o['off_by']})" for o in lp["off_by_n"]]
    out.append("Unknown handling (ground-truth unknown edges):")
    cnt = {}
    for u in result["unknown"]:
        out.append(f"  {u['edge']} {u['type']} {u['file']}:{u['line']} -> {u['status']}")
        cnt[u["status"]] = cnt.get(u["status"], 0) + 1
    out.append("  summary: " + ", ".join(f"{k}={v}" for k, v in sorted(cnt.items())))
    out.append("Coverage by language (tp/expected): " + ", ".join(
        f"{k}={v['tp']}/{v['expected']}" for k, v in sorted(result["coverage_by_language"].items())))
    out.append(f"Files seen/total: {json.dumps(result['files'])}; external_refs: {result['external_refs']}")
    out.append("Languages with zero extracted nodes: " + (", ".join(result["languages_zero_nodes"]) or "(none)"))
    out.append("Ignored: " + json.dumps(result["ignored"], sort_keys=True))
    v = result["verdict"]
    out.append(f"VERDICT {v['criterion']}: {v['result']} (false observed = {v['false_observed']}, "
               f"overclaimed = {v['overclaimed']}, negatives hit = {v['negatives_hit']})")
    return "\n".join(out)


def render(result, engine, schema_errs):
    out = []
    out.append("G1 SCORE REPORT (counts only)")
    out.append(f"engine: {engine.get('name')} {engine.get('version')}")
    out.append("envelope schema: " + ("VALID" if not schema_errs else f"INVALID ({len(schema_errs)} errors)"))
    for err in schema_errs[:10]:
        out.append("  schema error: " + err)
    out.append("")
    out.append("Edge type   expected    TP    FN    FP")
    out.append("----------  --------  ----  ----  ----")
    tot = {"expected": 0, "tp": 0, "fn": 0, "fp": 0}
    for ty in EDGE_TYPES:
        r = result["table"][ty]
        out.append(f"{ty:<10}  {r['expected']:>8}  {r['tp']:>4}  {r['fn']:>4}  {r['fp']:>4}")
        for k in tot:
            tot[k] += r[k]
    out.append(f"{'TOTAL':<10}  {tot['expected']:>8}  {tot['tp']:>4}  {tot['fn']:>4}  {tot['fp']:>4}")
    out.append("")
    out.append("Missed (FN):")
    out += ["  " + m for m in result["missed"]] or ["  (none)"]
    out.append(f"False observed edges: {len(result['false_observed'])}")
    out += ["  " + m for m in result["false_observed"]]
    out.append(f"Extra inferred edges (FP, not observed): {len(result['extra_inferred'])}")
    out += ["  " + m for m in result["extra_inferred"]]
    out.append(f"Type mismatches (listed, not FP): {len(result['type_mismatch'])}")
    out += [f"  {m['engine']} (expected type {m['expected_type']}, {m['gt_edge']})" for m in result["type_mismatch"]]
    out.append(f"Negatives hit (engine edges matching a negative): {len(result['negatives_hit'])}; negatives defined: {result['negatives_total']}")
    out += [f"  {'+'.join(h['negatives'])}: {h['engine']} ({h['reason']})" for h in result["negatives_hit"]]
    lp = result["line_provenance"]
    out.append(f"Line provenance of matched edges: exact={lp['exact']} off_by_n={len(lp['off_by_n'])} missing={lp['missing']}")
    out += [f"  {o['edge']}: expected {o['expected']} got {o['got']} (off by {o['off_by']})" for o in lp["off_by_n"]]
    out.append("Unknown handling (ground-truth unknown edges):")
    for u in result["unknown"]:
        out.append(f"  {u['edge']} {u['type']} {u['file']}:{u['line']} -> {u['status']}")
    cnt = {}
    for u in result["unknown"]:
        cnt[u["status"]] = cnt.get(u["status"], 0) + 1
    out.append("  summary: " + ", ".join(f"{k}={v}" for k, v in sorted(cnt.items())))
    out.append("Languages with zero extracted nodes: " + (", ".join(result["languages_zero_nodes"]) or "(none)"))
    out.append("Engine node counts by language: " + json.dumps(result["engine_node_counts"], sort_keys=True))
    out.append("Ignored: " + json.dumps(result["ignored"], sort_keys=True))
    v = result["verdict"]
    out.append(f"VERDICT {v['criterion']}: {v['result']} (false observed edges = {v['false_observed']})")
    return "\n".join(out)


def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def run_score(env_path, gt_path, json_out=None, quiet=False, contract="auto"):
    gt = load_json(gt_path)
    env = load_json(env_path)
    is_v1_env = env.get("envelope_version") == V1
    if contract == "auto":
        contract = "v1" if is_v1_env else "v0"
    if contract == "v0" and is_v1_env:
        raise SystemExit("--contract v0 cannot score a kawalys.graph.v1 envelope")
    schema_errs = validate_schema(env, load_json(SCHEMA_V1_PATH if is_v1_env else SCHEMA_PATH))
    if contract == "v1":
        c_errs = contract_errors(env) if is_v1_env else []
        result = score_v1(env, gt)
        result["schema_errors"] = schema_errs
        result["contract_errors"] = c_errs
        text = render_v1(result, env.get("engine", {}), schema_errs, c_errs)
    else:
        result = score(env, gt)
        result["schema_errors"] = schema_errs
        text = render(result, env.get("engine", {}), schema_errs)
    if not quiet:
        print(text)
    if json_out:
        with open(json_out, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(result, fh, indent=2, sort_keys=True)
            fh.write("\n")
    return result


# ---------------------------------------------------------------- self-check
CENSUS = [re.compile(p) for p in (
    r"^\s*import\b", r"^\s*export\b.*\bfrom\s", r"^\s*from\s+\S+\s+import\b",
    r"\brequire\(", r"\bimport\(", r"\bimport_module\(")]


def read_lines(rel):
    with open(os.path.join(HERE, rel), "r", encoding="utf-8", newline="") as fh:
        return fh.read().replace("\r\n", "\n").split("\n")


def gt_to_v1_envelope(gt, envgt):
    """The ground truth written as a kawalys.graph.v1 envelope (in memory; the renderers keep loading the v0 file)."""
    edges = []
    for e in gt_v1_edges(gt):
        d = {"type": e["type"], "from": e["from"], "to": e["to"], "file": e["file"], "line": e["line"], "basis": e["basis"]}
        if e["type"] == "imports":
            d["form"] = e["form"]
        if e["type"] == "contains":
            d["line_source"] = "derived"
        if e.get("target_hint"):
            d["target_hint"] = e["target_hint"]
        edges.append(d)
    n_files = sum(1 for n in gt["nodes"] if n["kind"] == "module")
    return {"envelope_version": V1, "source": envgt["source"], "engine": envgt["engine"],
            "generated_at": envgt["generated_at"], "nodes": envgt["nodes"], "edges": edges, "omissions": [],
            "coverage": {"files_seen": n_files, "files_total": n_files},
            "external_refs": len(gt["external_imports"])}


def self_check_v1(gt, envgt, need):
    """Contract v1 checks: overlay sanity, schema, contract_errors and one scenario per rule R1 to R8."""
    schema1 = load_json(SCHEMA_V1_PATH)
    for e in gt["edges"]:
        need(e.get("v1_basis") in (None, "inferred") and (e.get("v1_basis") is None or e["type"] == "calls"),
             f"edge {e['id']}: v1_basis only allowed as 'inferred' on calls")
        need(e.get("v1_form") in (None, "reexport") and (e.get("v1_form") is None or e["type"] == "reexports"),
             f"edge {e['id']}: v1_form only allowed as 'reexport' on reexports")
    v1 = gt_v1_edges(gt)
    keys = [(e["type"], e["from"], e["to"]) for e in v1 if e["basis"] != "unknown"]
    need(len(keys) == len(set(keys)), "v1 view: duplicate (type, from, to) keys")
    need(sum(1 for e in v1 if e["basis"] == "inferred") == 2, "v1 view: expected exactly 2 inferred ground-truth edges")
    base = gt_to_v1_envelope(gt, envgt)
    need(not validate_schema(base, schema1), "v1 ground-truth envelope invalid: " + "; ".join(validate_schema(base, schema1)[:3]))
    need(not contract_errors(base), "v1 ground-truth envelope has contract errors: " + "; ".join(contract_errors(base)[:3]))
    n_edges = sum(1 for e in v1 if e["basis"] != "unknown")

    def edge(env, eid):
        g = next(x for x in gt["edges"] if x["id"] == eid)
        want = {"imports": "imports", "reexports": "imports"}.get(g["type"], g["type"])
        to = module_of(g["to"]) if want == "imports" else g["to"]
        return next(x for x in env["edges"] if (x["type"], x["from"], x["to"], x["line"]) == (want, g["from"], to, g["line"]))

    def tp_fn_fp(r):
        return tuple(sum(v[k] for v in r["table"].values()) for k in ("tp", "fn", "fp"))

    # S0: the ground truth scores perfectly
    r0 = score_v1(base, gt)
    need(tp_fn_fp(r0) == (n_edges, 0, 0), f"v1 S0 tp/fn/fp = {tp_fn_fp(r0)}, want {(n_edges, 0, 0)}")
    need(not (r0["false_observed"] or r0["overclaimed"] or r0["understated"] or r0["derived"] or r0["negatives_hit"]
              or r0["form_mismatch"] or r0["false_inferred"] or r0["type_mismatch"]), "v1 S0 reports an unexpected finding")
    need(r0["line_provenance"] == {"exact": n_edges, "missing": 0, "off_by_n": []}, "v1 S0 lines not all exact")
    need(all(u["status"] == "marked_unknown" for u in r0["unknown"]), "v1 S0 unknown edges not all marked_unknown")
    need(r0["verdict"]["result"] == "PASS", "v1 S0 verdict must be PASS")
    # S1: R1 fold, R2 derived, R3 legacy type and form, R4 overclaim and underclaim, R8 verdict
    env = copy.deepcopy(base)
    env["edges"] += [
        {"type": "imports", "form": "import", "names": ["Cart"], "from": "src/web/orders.ts", "to": "src/web/pricing.ts::Cart",
         "file": "src/web/orders.ts", "line": 3, "basis": "observed"},
        {"type": "imports", "form": "import", "from": "src/web/OrderList.tsx", "to": "src/web/orders.ts",
         "file": "src/web/OrderList.tsx", "line": 4, "basis": "observed", "via": "barrel"}]
    edge(env, "E13")["basis"] = "observed"
    edge(env, "E14")["basis"] = "inferred"
    e10 = edge(env, "E10")
    e10["type"], e10["to"] = "reexports", "src/web/orders.ts::buildOrder"
    del e10["form"]
    edge(env, "E06")["form"] = "reexport"
    r1 = score_v1(env, gt)
    need(tp_fn_fp(r1) == (n_edges, 0, 0), f"v1 S1 tp/fn/fp = {tp_fn_fp(r1)}, want {(n_edges, 0, 0)} (fold, derived, legacy reexports)")
    # two folds: the explicit symbol import and the legacy symbol-level reexports edge written above
    need(r1["ignored"]["names_folded"] == 2 and len(r1["derived"]) == 1 and not r1["false_observed"],
         "v1 S1: symbol import must fold (R1) and barrel import must be derived (R2), neither a false edge")
    need((len(r1["overclaimed"]), len(r1["understated"]), len(r1["form_mismatch"])) == (1, 1, 1),
         f"v1 S1 overclaimed/understated/form_mismatch = {(len(r1['overclaimed']), len(r1['understated']), len(r1['form_mismatch']))}, want (1, 1, 1)")
    need(r1["verdict"]["result"] == "FAIL" and r1["verdict"]["overclaimed"] == 1, "v1 S1: an overclaimed inferred truth must FAIL")
    # S2: R5 external package does not claim; an observed edge to the real target does
    env = copy.deepcopy(base)
    env["edges"] = [e for e in env["edges"] if e["basis"] != "unknown"]
    env["edges"].append({"type": "calls", "from": "src/svc/gateway.py::submit_order", "to": "requests.post",
                         "file": "src/svc/gateway.py", "line": 18, "basis": "observed"})
    # a contains edge with no line from the same module (CodeGraph style) must not claim E23 or E24 either
    env["edges"].append({"type": "contains", "from": "src/web/loader.ts", "to": "src/web/loader.ts::loadPlugin",
                         "file": "src/web/loader.ts", "line": None, "basis": "observed"})
    r2 = score_v1(env, gt)
    need({u["edge"]: u["status"] for u in r2["unknown"]} == {"E23": "silent", "E24": "silent", "E25": "silent"},
         "v1 S2: an observed edge to an external package must not claim the unknown (R5)")
    env["edges"].append({"type": "calls", "from": "src/svc/gateway.py::submit_order", "to": "src/web/handler.ts::createOrderHandler",
                         "file": "src/svc/gateway.py", "line": 18, "basis": "observed"})
    r2b = score_v1(env, gt)
    need(next(u for u in r2b["unknown"] if u["edge"] == "E25")["status"] == "claimed_observed" and len(r2b["false_observed"]) == 1,
         "v1 S2: an observed cross-runtime edge to the real target must claim the unknown and be a false observed edge")
    # S3: R8 negative hit
    env = copy.deepcopy(base)
    env["edges"].append({"type": "imports", "form": "import", "from": "src/svc/app.py", "to": "src/svc/unused.py",
                         "file": "src/svc/app.py", "line": 3, "basis": "observed"})
    r3 = score_v1(env, gt)
    need(len(r3["negatives_hit"]) >= 1 and len(r3["false_observed"]) == 1 and r3["verdict"]["result"] == "FAIL",
         "v1 S3: an observed import of the unused module must hit a negative and FAIL")
    # S4: schema and contract_errors
    env = copy.deepcopy(base)
    del env["coverage"]
    need(any("coverage" in x for x in validate_schema(env, schema1)), "v1 S4: schema must require coverage")
    env = copy.deepcopy(base)
    del next(e for e in env["edges"] if e["type"] == "imports")["form"]
    next(e for e in env["edges"] if e["basis"] == "observed" and e["type"] == "calls")["line"] = None
    next(e for e in env["edges"] if e["type"] == "contains").pop("line_source")
    need(len(contract_errors(env)) == 3, f"v1 S4: contract_errors = {len(contract_errors(env))}, want 3")


def self_check():
    fails = []

    def need(cond, msg):
        if not cond:
            fails.append(msg)

    gt = load_json(GT_PATH)
    envgt = load_json(ENV_GT_PATH)
    schema = load_json(SCHEMA_PATH)
    th = tree_hash()
    need(gt["fixture"]["tree_sha256"] == th, "ground-truth.json tree hash differs from computed " + th)
    need(envgt["source"]["revision"] == th, "envelope revision differs from computed tree hash")
    files = []
    for root, dirs, fs in os.walk(SRC):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        files += [os.path.relpath(os.path.join(root, f), HERE).replace(os.sep, "/") for f in fs if not f.endswith(".pyc")]
    files.sort()
    need(12 <= len(files) <= 16, f"fixture file count {len(files)} outside 12..16")
    modules = {n["id"] for n in gt["nodes"] if n["kind"] == "module"}
    need(modules == set(files), "module nodes differ from files on disk")
    ids = [n["id"] for n in gt["nodes"]]
    need(len(ids) == len(set(ids)), "duplicate node ids")
    idset = set(ids)
    cache = {}

    def line_text(rel, line):
        lines = cache.setdefault(rel, read_lines(rel))
        return lines[line - 1] if 1 <= line <= len(lines) else None

    for n in gt["nodes"]:
        txt = line_text(n["file"], n["line"])
        tok = n["id"].partition("::")[2].split(".")[-1] if "::" in n["id"] else None
        need(txt is not None, f"node {n['id']}: line {n['line']} out of range")
        if txt is not None and tok:
            need(tok in txt, f"node {n['id']}: line {n['line']} lacks {tok!r}: {txt.strip()}")
    eids = [e["id"] for e in gt["edges"]]
    need(len(eids) == len(set(eids)), "duplicate edge ids")
    keys = [(e["type"], e["from"], e["to"]) for e in gt["edges"] if e["basis"] == "observed"]
    need(len(keys) == len(set(keys)), "duplicate (type, from, to) keys among observed edges")
    for e in gt["edges"]:
        txt = line_text(e["file"], e["line"])
        need(txt is not None and e["evidence_token"] in txt,
             f"edge {e['id']}: line {e['line']} of {e['file']} lacks {e['evidence_token']!r}: {txt}")
        need(e["from"] in idset, f"edge {e['id']}: unknown from {e['from']}")
        if e["to"] is None:
            need(e["basis"] == "unknown" and e.get("target_hint"), f"edge {e['id']}: null to needs unknown + hint")
        else:
            need(e["to"] in idset, f"edge {e['id']}: unknown to {e['to']}")
    # import census: every import-like line is a ground-truth edge or a listed external import
    cited = {(e["file"], e["line"]) for e in gt["edges"] if e["type"] in ("imports", "reexports")}
    ext = {(x["file"], x["line"]) for x in gt["external_imports"]}
    for x in gt["external_imports"]:
        txt = line_text(x["file"], x["line"])
        need(txt is not None and x["token"] in txt, f"external import {x['file']}:{x['line']} lacks {x['token']!r}")
    for rel in files:
        for i, txt in enumerate(read_lines(rel), 1):
            if any(rx.search(txt) for rx in CENSUS):
                need((rel, i) in cited or (rel, i) in ext, f"census: unaccounted import-like line {rel}:{i}: {txt.strip()}")
    # negatives
    nids = [n["id"] for n in gt["negatives"]]
    need(len(nids) == len(set(nids)), "duplicate negative ids")
    gt_keys = set(keys)
    for n in gt["negatives"]:
        need(n["from"] == "*" or n["from"] in idset, f"negative {n['id']}: unknown from")
        need(module_of(n["to"]) in modules, f"negative {n['id']}: to-module not in fixture")
        need((n["type"], n["from"], n["to"]) not in gt_keys, f"negative {n['id']} is also a ground-truth edge")
        ev = n.get("evidence")
        if ev:
            txt = line_text(ev["file"], ev["line"])
            need(txt is not None and ev["token"] in txt, f"negative {n['id']}: evidence line lacks token")
    for e in gt["edges"]:
        need(not (e["type"] == "imports" and module_of(e["to"] or "") == "src/svc/unused.py"),
             "an imports edge targets the unused module")
    # envelope vs ground truth and schema
    errs = validate_schema(envgt, schema)
    need(not errs, "ground-truth.envelope.json invalid: " + "; ".join(errs[:5]))
    need(len(envgt["nodes"]) == len(gt["nodes"]), "envelope node count differs")
    need(len(envgt["edges"]) == len(gt["edges"]), "envelope edge count differs")
    need(envgt["engine"]["name"] == "ground-truth", "envelope engine name must be ground-truth")
    # normalisation unit checks
    res = Resolver(sorted(modules))
    for raw, want in (("./src/web/Orders", "src/web/orders.ts"), ("src/web/pricing.js", "src/web/pricing.ts"),
                      ("svc.service", "src/svc/service.py"), ("src\\svc\\schema.py", "src/svc/schema.py"),
                      ("src/svc", "src/svc/__init__.py"), ("src/web", "src/web/index.ts"),
                      ("src/web/format", "src/web/format.js"), ("react", None)):
        need(res.module(raw) == want, f"normalise {raw!r}: got {res.module(raw)!r}, want {want!r}")
    # scorer scenario tests
    r1 = score(envgt, gt)
    n_obs = sum(1 for e in gt["edges"] if e["basis"] == "observed")
    tp1 = sum(v["tp"] for v in r1["table"].values())
    fn1 = sum(v["fn"] for v in r1["table"].values())
    fp1 = sum(v["fp"] for v in r1["table"].values())
    need((tp1, fn1, fp1) == (n_obs, 0, 0), f"ground-truth envelope scenario: tp/fn/fp = {tp1}/{fn1}/{fp1}, want {n_obs}/0/0")
    need(not r1["negatives_hit"] and not r1["false_observed"], "ground-truth envelope hits negatives or false edges")
    need(r1["line_provenance"]["exact"] == n_obs and not r1["line_provenance"]["off_by_n"], "ground-truth lines not all exact")
    need(all(u["status"] == "marked_unknown" for u in r1["unknown"]), "ground-truth unknown edges not all marked_unknown")
    need(not r1["languages_zero_nodes"], "ground-truth envelope has a language with zero nodes")
    if os.path.exists(MUTATED_PATH):
        mut = load_json(MUTATED_PATH)
        need(not validate_schema(mut, schema), "mutated envelope invalid against schema")
        r2 = score(mut, gt)
        tp2 = sum(v["tp"] for v in r2["table"].values())
        fn2 = sum(v["fn"] for v in r2["table"].values())
        got = (len(r2["false_observed"]), fn2, len(r2["line_provenance"]["off_by_n"]), len(r2["negatives_hit"]), tp2)
        want = (2, 1, 1, 1, n_obs - 1)
        need(got == want, f"mutated scenario (false_observed, fn, off_by_n, negatives_hit, tp) = {got}, want {want}")
        need(r2["verdict"]["result"] == "FAIL", "mutated scenario verdict must be FAIL")
    else:
        need(False, "test/mutated.envelope.json missing")
    self_check_v1(gt, envgt, need)
    # report
    by = {}
    for e in gt["edges"]:
        by[(e["type"], e["basis"])] = by.get((e["type"], e["basis"]), 0) + 1
    print(f"files={len(files)} nodes={len(gt['nodes'])} edges={len(gt['edges'])} negatives={len(gt['negatives'])} "
          f"external_imports={len(gt['external_imports'])}")
    print("edges by (type, basis): " + ", ".join(f"{k[0]}/{k[1]}={v}" for k, v in sorted(by.items())))
    print("tree sha256: " + th)
    if fails:
        for f in fails:
            print("[FAIL] " + f)
        print(f"SELF-CHECK FAILED ({len(fails)} problems)")
        return 1
    print("SELF-CHECK PASSED")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="G1-01 graph envelope scorer")
    ap.add_argument("envelope", nargs="?", help="normalized envelope json to score")
    ap.add_argument("--ground-truth", default=GT_PATH)
    ap.add_argument("--json", dest="json_out")
    ap.add_argument("--contract", choices=("auto", "v0", "v1"), default="auto",
                    help="auto (default) follows the envelope's envelope_version; v1 on a v0 envelope is for calibration only")
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--tree-hash", action="store_true")
    args = ap.parse_args(argv)
    if args.tree_hash:
        print(tree_hash())
        return 0
    if args.self_check:
        return self_check()
    if not args.envelope:
        ap.error("envelope path required (or --self-check / --tree-hash)")
    run_score(args.envelope, args.ground_truth, args.json_out, contract=args.contract)
    return 0


if __name__ == "__main__":
    sys.exit(main())
