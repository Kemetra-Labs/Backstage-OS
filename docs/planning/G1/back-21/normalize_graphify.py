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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("graph")
    ap.add_argument("fixture_dir")
    ap.add_argument("out")
    ap.add_argument("--cmd", default="graphify extract <fixture-copy> --code-only")
    ap.add_argument("--stderr", default=None, help="engine stderr log (for engine-reported warnings)")
    a = ap.parse_args()
    with open(a.graph, encoding="utf-8") as fh:
        graph = json.load(fh)
    stderr_text = ""
    if a.stderr:
        with open(a.stderr, encoding="utf-8") as fh:
            stderr_text = fh.read()
    ts = datetime.datetime.fromtimestamp(os.path.getmtime(a.graph), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    env = normalize(graph, a.fixture_dir, a.cmd, ts, stderr_text)
    with open(a.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(env, fh, indent=2)
        fh.write("\n")
    print(f"[OK] {len(env['nodes'])} nodes, {len(env['edges'])} edges, {len(env['omissions'])} omissions -> {a.out}")


if __name__ == "__main__":
    main()
