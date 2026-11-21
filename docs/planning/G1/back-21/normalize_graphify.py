"""Normalize Graphify 0.9.114 graph.json (code-only AST run) into the kawalys.graph.v0 envelope.

Usage: python -I normalize_graphify.py <graph.json> <fixture-copy-dir> <out.envelope.json> [--cmd "<command line>"]

MAPPING RULES (fixed before scoring; not tuned to the score, same rules for every edge):

Nodes
  N1  A node with file_type=code whose label equals the basename of source_file and whose
      source_location is L1 is a module; id = source_file (already repo/fixture relative).
  N2  A code node with _callable_class=true becomes kind=class (Graphify also marks TS interfaces
      this way; there is no 'interface' kind in the envelope, so interfaces become class).
  N3  A code node with _callable=true and a label starting with '.' is a method; its owning class
      comes from the Graphify 'method' edge (class -> method). id = file::Class.method.
      If no owner is found the id falls back to file::name.
  N4  Any other _callable code node is a function (id = file::name, label '()' stripped).
      Graphify has no component kind, so React components stay kind=function.
  N5  Non-callable code nodes (e.g. the constant ORDERS_ROUTE) have no envelope kind: omitted,
      recorded in omissions. 'rationale' nodes (docstrings) and external concept nodes
      (file_type=concept, external=true) are not envelope nodes.
  N6  line = number after 'L' in source_location. language by file extension.

Edges (file = edge source_file, line = number after 'L' in source_location, from/to mapped by N1-N4)
  E1  relation contains            -> type contains   (module -> symbol)
  E2  relation method              -> type contains   (class -> method)
  E3  relation calls               -> type calls
  E4  relation imports_from        -> type imports    (module -> module)
  E5  relation imports             -> type imports    (module -> imported SYMBOL; emitted verbatim, the
                                      scorer's module-level ground truth does not list these)
  E6  relation re_exports          -> type reexports  (verbatim, both the module and the symbol variant)
  E7  relation indirect_call       -> type calls, basis inferred (verbatim)
  E8  relation rationale_for       -> dropped (documentation link, no envelope type)
  Targets that are external concept nodes keep the Graphify label as `to` (react, json, ...), the
  scorer treats them as external.

Basis (the engine's own labels, nothing upgraded)
  B1  confidence == EXTRACTED and _origin == ast  -> observed
  B2  confidence INFERRED or AMBIGUOUS, or _origin != ast (llm/semantic)  -> inferred
  B3  Graphify exposes no 'unknown/unresolved' edge class in graph.json -> this normalizer emits no
      unknown edges and no omission for unresolved dynamic cases (it cannot know about them).
  Only engine-reported conditions become omissions: the stderr warning that a file yielded no symbols,
  and the omitted non-callable nodes of N5.

engine_native_id: '<source id>|<relation>|<target id>' for edges, the Graphify node id for nodes.
generated_at: UTC mtime of graph.json (so reruns of the normalizer are byte-identical).
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import sys

EXT_LANG = {".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".py": "python"}


def tree_hash(fixture_dir):
    src = os.path.join(fixture_dir, "src")
    entries = []
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for name in files:
            if name.endswith(".pyc"):
                continue
            full = os.path.join(root, name)
            entries.append((os.path.relpath(full, fixture_dir).replace(os.sep, "/"), full))
    entries.sort()
    h = hashlib.sha256()
    for rel, full in entries:
        with open(full, "rb") as fh:
            h.update(rel.encode("utf-8") + b"\0" + fh.read().replace(b"\r\n", b"\n") + b"\0")
    return h.hexdigest()


def line_of(loc):
    m = re.fullmatch(r"L(\d+)", loc or "")
    return int(m.group(1)) if m else None


def lang_of(path):
    return EXT_LANG.get(os.path.splitext(path)[1].lower(), "unknown")


def basis_of(edge):
    if edge.get("confidence") == "EXTRACTED" and edge.get("_origin", "ast") == "ast":
        return "observed"
    return "inferred"


def normalize(graph, fixture_dir, cmd, generated_at, stderr_text=""):
    nodes_in = {n["id"]: n for n in graph["nodes"]}
    links = graph["links"]
    owner = {e["target"]: e["source"] for e in links if e["relation"] == "method"}
    omissions, out_nodes, idmap = [], [], {}

    def is_module(n):
        sf = n.get("source_file") or ""
        return (n.get("file_type") == "code" and sf and n.get("label") == os.path.basename(sf)
                and n.get("source_location") == "L1")

    for n in graph["nodes"]:
        sf = n.get("source_file")
        if n.get("file_type") != "code" or not sf:
            continue
        label = n.get("label", "")
        if is_module(n):
            nid, kind = sf, "module"
        elif n.get("_callable_class"):
            nid, kind = f"{sf}::{label}", "class"
        elif n.get("_callable") and label.startswith("."):
            cls = nodes_in.get(owner.get(n["id"]))
            name = label[1:].rstrip("()")
            nid = f"{sf}::{cls['label']}.{name}" if cls else f"{sf}::{name}"
            kind = "method"
        elif n.get("_callable"):
            nid, kind = f"{sf}::{label.rstrip('()')}", "function"
        else:
            omissions.append({"what": f"{sf}::{label}",
                              "reason": "Graphify non-callable symbol has no envelope node kind (not mapped)"})
            continue
        idmap[n["id"]] = nid
        out_nodes.append({"id": nid, "kind": kind, "language": lang_of(sf), "file": sf,
                          "line": line_of(n.get("source_location")) or 1, "engine_native_id": n["id"]})

    rel_type = {"contains": "contains", "method": "contains", "calls": "calls", "imports_from": "imports",
                "imports": "imports", "re_exports": "reexports", "indirect_call": "calls"}
    out_edges, dropped = [], {}
    for e in links:
        t = rel_type.get(e["relation"])
        if t is None:
            dropped[e["relation"]] = dropped.get(e["relation"], 0) + 1
            continue
        src = idmap.get(e["source"])
        tgt_node = nodes_in.get(e["target"])
        tgt = idmap.get(e["target"])
        if tgt is None and tgt_node is not None and tgt_node.get("external"):
            tgt = tgt_node["label"]
        if src is None or tgt is None:
            dropped["unmapped-endpoint:" + e["relation"]] = dropped.get("unmapped-endpoint:" + e["relation"], 0) + 1
            continue
        basis = "inferred" if e["relation"] == "indirect_call" else basis_of(e)
        out_edges.append({"type": t, "from": src, "to": tgt, "file": e["source_file"],
                          "line": line_of(e.get("source_location")), "basis": basis,
                          "engine_native_id": f"{e['source']}|{e['relation']}|{e['target']}"})
    for rel, cnt in sorted(dropped.items()):
        omissions.append({"what": f"{cnt} Graphify edge(s) of relation {rel}",
                          "reason": "no envelope edge type or endpoint is not an envelope node (not mapped)"})
    for m in re.finditer(r"warning: (\d+) code file\(s\) yielded no symbols.*?: (\S+)", stderr_text):
        omissions.append({"what": m.group(2), "reason": "engine warning: file yielded no symbols"})
    cfg = hashlib.sha256((cmd + "|GRAPHIFY_BACKEND=none|code-only").encode()).hexdigest()
    return {
        "envelope_version": "kawalys.graph.v0",
        "source": {"scope": "fixture-copy", "revision": tree_hash(fixture_dir), "fixture_version": "g1-01-v0"},
        "engine": {"name": "graphify", "version": graph.get("graph", {}).get("graphify_version", "unknown"),
                   "config_digest": cfg},
        "generated_at": generated_at,
        "nodes": sorted(out_nodes, key=lambda n: n["id"]),
        "edges": out_edges,
        "omissions": omissions,
    }


# ----------------------------------------------------------------------------------------------------------
# kawalys.graph.v1 path (BACK-28, G1-C1 Step 1c; CONTRACT-V1.md R1-R8). The v0 code above is unchanged and stays
# the default. Mapping rules for v1 (same discipline: fixed before scoring, same rule for every edge):
#
#   V1  One `imports` edge per import statement (R1): an `imports_from` link (or an `imports` link to a module) gives
#       the statement edge, `to` = the literal specifier's file. `imports` links to a symbol at the same file and
#       line fold into names[] of that edge; they are never separate edges.
#   V2  `re_exports` (R3): module and symbol variants at one file and line collapse to one `imports` edge. On
#       .ts/.tsx/.js sources form=reexport; on .py sources form=import (language rule, never a fixture name),
#       so `from .x import Y` with __all__ stays an import.
#   V3  A symbol `imports` link whose file differs from the line's literal specifier AND whose literal file
#       re-exports that file (re_exports links in the same graph) is also emitted as a derived edge with
#       via=barrel (R2). Without that evidence nothing derived is emitted and the case is recorded as an omission.
#   V4  basis: unchanged from v0 (R4). Merging duplicates keeps the weaker label, never an upgrade.
#   V5  `contains` / `method` links: line = the child node's definition line, line_source=derived (R7); the
#       engine's own link line is not used. A calls link without a source_location is not emitted and is counted.
#   V6  Targets that are engine-marked external nodes are counted in external_refs, not emitted (R5, R8).
#   V7  Graphify has no unknown class: no unknown edge is ever emitted. form is not reported by the engine, so
#       every non-reexport statement defaults to form=import; the count is recorded as an omission.
#   V8  coverage: files_total from the scope walk (as tree_hash), files_seen = module nodes in the output.
# ----------------------------------------------------------------------------------------------------------
_IMPORT_RELS = ("imports_from", "imports", "re_exports")
_RANK = {"observed": 0, "inferred": 1}


def _module_of(node_id):
    return node_id.split("::", 1)[0]


def scope_file_count(fixture_dir):
    n = 0
    for _root, dirs, files in os.walk(os.path.join(fixture_dir, "src")):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        n += sum(1 for f in files if not f.endswith(".pyc"))
    return n


def _add_name(edge, name):
    names = edge.setdefault("names", [])
    if name not in names:
        names.append(name)


def normalize_v1(graph, fixture_dir, cmd, generated_at, stderr_text=""):
    base = normalize(graph, fixture_dir, cmd, generated_at, stderr_text)  # reused for the node mapping only
    nodes_in = {n["id"]: n for n in graph["nodes"]}
    idmap = {n["engine_native_id"]: n["id"] for n in base["nodes"]}
    node_line = {n["id"]: n["line"] for n in base["nodes"]}
    omissions = [o for o in base["omissions"]
                 if "non-callable symbol" in o["reason"] or o["reason"].startswith("engine warning")]
    out, recs, dropped, ext_refs, no_line = [], [], {}, set(), 0
    reexport_targets = set()
    rel_type = {"contains": "contains", "method": "contains", "calls": "calls", "indirect_call": "calls"}

    def drop(key):
        dropped[key] = dropped.get(key, 0) + 1

    for e in graph["links"]:
        rel = e["relation"]
        s, line = idmap.get(e["source"]), line_of(e.get("source_location"))
        tn = nodes_in.get(e["target"])
        tgt = idmap.get(e["target"])
        ext = tgt is None and tn is not None and tn.get("external")
        if rel not in rel_type and rel not in _IMPORT_RELS:
            drop(rel)
            continue
        if s is None or (tgt is None and not ext):
            drop("unmapped-endpoint:" + rel)
            continue
        if ext:  # V6: counted, never emitted, never an unknown claim
            ext_refs.add((s, line, tn["label"]))
            continue
        if rel == "re_exports":
            reexport_targets.add((s, _module_of(tgt)))
        if rel in _IMPORT_RELS:
            if line is None:
                no_line += 1
            else:
                recs.append((rel, e, s, line, tgt))
            continue
        if rel in ("contains", "method"):  # V5: the child's NATIVE location only; v0's `or 1` default is never used
            child_line = line_of(nodes_in[e["target"]].get("source_location"))
            if child_line is None:
                no_line += 1
                continue
            out.append({"type": "contains", "from": s, "to": tgt, "file": e["source_file"], "line": child_line,
                        "line_source": "derived", "basis": basis_of(e),
                        "engine_native_id": f"{e['source']}|{rel}|{e['target']}"})
            continue
        if line is None:
            no_line += 1
            continue
        basis = "inferred" if rel == "indirect_call" else basis_of(e)
        out.append({"type": "calls", "from": s, "to": tgt, "file": e["source_file"], "line": line, "basis": basis,
                    "engine_native_id": f"{e['source']}|{rel}|{e['target']}"})

    stmts = {}  # (from, line, to, via) -> statement edge; insertion order = link order

    def statement(e, s, line, to, form, via=None):
        key = (s, line, to, via)
        cur = stmts.get(key)
        basis = basis_of(e)
        if cur is None:
            cur = {"type": "imports", "form": form, "from": s, "to": to, "file": e["source_file"], "line": line,
                   "basis": basis, "engine_native_id": f"{e['source']}|{e['relation']}|{e['target']}"}
            if via:
                cur["via"] = via
            stmts[key] = cur
        elif _RANK[basis] > _RANK[cur["basis"]]:
            cur["basis"] = basis  # V4: the weaker label wins, nothing is upgraded
        return cur

    for rel, e, s, line, tgt in recs:  # V1 literal statements
        if rel != "re_exports" and "::" not in tgt:
            statement(e, s, line, tgt, "import")
    for rel, e, s, line, tgt in recs:  # V2 re-exports
        if rel == "re_exports":
            form = "import" if os.path.splitext(_module_of(s))[1].lower() == ".py" else "reexport"
            cur = statement(e, s, line, _module_of(tgt), form)
            if "::" in tgt:
                _add_name(cur, tgt.split("::", 1)[1])
    different_file = unattached = 0
    for rel, e, s, line, tgt in recs:  # V1 names, V3 barrel
        if rel == "re_exports" or "::" not in tgt:
            continue
        here = [v for k, v in stmts.items() if k[0] == s and k[1] == line and k[3] is None]
        name, mod = tgt.split("::", 1)[1], _module_of(tgt)
        own = [v for v in here if v["to"] == mod]
        if own:
            _add_name(own[0], name)
        elif here:
            _add_name(here[0], name)
            if (here[0]["to"], mod) in reexport_targets:
                _add_name(statement(e, s, line, mod, "import", via="barrel"), name)
            else:
                different_file += 1
        else:
            unattached += 1
    out.extend(stmts.values())

    for rel, cnt in sorted(dropped.items()):
        omissions.append({"what": f"{cnt} Graphify edge(s) of relation {rel}",
                          "reason": "no envelope edge type or endpoint is not an envelope node (not mapped)"})
    if different_file:
        omissions.append({"what": f"{different_file} Graphify symbol import(s)",
                          "reason": "resolved to a different file than the literal specifier with no re-export evidence "
                                    "in the graph; derived edge not emitted (R2)"})
    if unattached:
        omissions.append({"what": f"{unattached} Graphify symbol import(s)",
                          "reason": "no statement edge at the same file and line; not emitted"})
    if no_line:
        omissions.append({"what": f"{no_line} Graphify edge(s) without a source line",
                          "reason": "the engine reports no line; an observed or inferred edge needs one, so it is not "
                                    "emitted and no line is guessed (R7)"})
    n_node_default = sum(1 for n in base["nodes"]
                         if line_of(nodes_in[n["engine_native_id"]].get("source_location")) is None)
    if n_node_default:
        omissions.append({"what": f"{n_node_default} Graphify node(s) without a source location",
                          "reason": "the schema requires a node line; the v0 node mapping defaulted it to 1, which is "
                                    "not an engine-reported line (no edge uses it)"})
    n_default = sum(1 for e in out if e["type"] == "imports" and e["form"] == "import")
    if n_default:
        omissions.append({"what": f"{n_default} import edge(s)",
                          "reason": "the engine does not report require or dynamic form; form defaulted to import "
                                    "(re-export form is derived from relation re_exports)"})
    cfg = hashlib.sha256((cmd + "|GRAPHIFY_BACKEND=none|code-only").encode()).hexdigest()
    return {
        "envelope_version": "kawalys.graph.v1",
        "source": {"scope": "fixture-copy", "revision": tree_hash(fixture_dir), "fixture_version": "g1-01-v0"},
        "engine": {"name": "graphify", "version": graph.get("graph", {}).get("graphify_version", "unknown"),
                   "config_digest": cfg},
        "generated_at": generated_at,
        "nodes": base["nodes"],
        "edges": out,
        "omissions": omissions,
        "coverage": {"files_seen": sum(1 for n in base["nodes"] if n["kind"] == "module"),
                     "files_total": scope_file_count(fixture_dir)},
        "external_refs": len(ext_refs),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("graph")
    ap.add_argument("fixture_dir")
    ap.add_argument("out")
    ap.add_argument("--cmd", default="graphify extract <fixture-copy> --code-only")
    ap.add_argument("--stderr", default=None, help="engine stderr log (for engine-reported warnings)")
    ap.add_argument("--contract", choices=("v0", "v1"), default="v0",
                    help="envelope contract to emit (default v0 keeps the BACK-21 output byte-identical)")
    a = ap.parse_args()
    with open(a.graph, encoding="utf-8") as fh:
        graph = json.load(fh)
    stderr_text = ""
    if a.stderr:
        with open(a.stderr, encoding="utf-8") as fh:
            stderr_text = fh.read()
    ts = datetime.datetime.fromtimestamp(os.path.getmtime(a.graph), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    env = (normalize_v1 if a.contract == "v1" else normalize)(graph, a.fixture_dir, a.cmd, ts, stderr_text)
    with open(a.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(env, fh, indent=2)
        fh.write("\n")
    print(f"[OK] {len(env['nodes'])} nodes, {len(env['edges'])} edges, {len(env['omissions'])} omissions -> {a.out}")


if __name__ == "__main__":
    main()
