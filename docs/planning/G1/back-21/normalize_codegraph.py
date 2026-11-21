"""Normalize a CodeGraph 1.6.4 SQLite index (.codegraph/codegraph.db) into the kawalys.graph.v0 envelope.

Usage: python -I normalize_codegraph.py <codegraph.db> <fixture-copy-dir> <out.envelope.json> [--cmd "<cmd>"]
The DB is opened read-only with the stdlib sqlite3 module.

MAPPING RULES (fixed before scoring; not tuned to the score, same rules for every row):

Nodes (table nodes; file_path is already relative to the indexed root = the fixture copy)
  N1  kind=file                 -> module, id = file_path
  N2  kind=class | interface    -> class   (no 'interface' kind in the envelope)
  N3  kind=method               -> method, id = file::Class.method  (qualified_name 'Class::m' -> 'Class.m')
  N4  kind=function             -> function, id = file::name. CodeGraph has no component kind, so React
                                   components stay function.
  N5  kind in (import, variable, constant, property, ...) -> no envelope kind, omitted and counted
                                   in omissions.
  line = start_line, language = nodes.language.

Edges (table edges; file = file_path of the source node, line = edges.line)
  E1  kind contains             -> contains  (only when both endpoints are mapped nodes)
  E2  kind calls                -> calls
  E3  kind instantiates         -> calls     (constructor call, e.g. Cart(), Order(); GT models these as calls)
  E4  kind imports              -> imports   (file -> file stays module level; file -> symbol is emitted
                                   verbatim as a symbol-level imports edge)
  E5  kind references (value references, type references, function_ref) -> dropped, counted in omissions
  E6  Edge `line` is the engine's own value; contains edges carry no line in the DB so line = null
      (not back-filled from the child node).

Basis (the engine's own labels only)
  B1  edges.provenance == 'heuristic'  -> inferred
  B2  metadata.resolvedBy == 'fuzzy' or metadata.confidence < 0.8 -> inferred
  B3  everything else (provenance NULL/'tree-sitter'/'scip', deterministic resolvers: import, file-path,
      exact-match, qualified-name, function-ref, instance-method) -> observed.
      Note: CodeGraph labels receiver-typed calls ('instance-method', confidence 0.9) as ordinary
      resolutions, so they become observed; Graphify labels the same kind of call INFERRED. This is a
      difference in the engines' self-labelling, not a mapping choice.

Unknown edges (table unresolved_refs, rows the resolver could not bind to a symbol)
  U1  reference_kind calls|imports -> an edge basis=unknown, to=null, target_hint=reference_name,
      type = the engine's reference_kind (calls->calls, imports->imports; no special-casing of
      dynamic import / importlib / HTTP), from = mapped source node, file/line from the row.
  U2  other reference kinds (decorates, function_ref, ...) -> counted in omissions only.
  The table also holds externals and builtins (react, json.load, Array.map): they are emitted as
  unknown too and counted; the scorer never treats unknown edges as false.

engine_native_id: node id / 'src|kind|tgt' for edges. generated_at: UTC mtime of the DB.
"""
import argparse
import datetime
import hashlib
import json
import os
import sqlite3

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


def basis_of(row):
    meta = json.loads(row["metadata"]) if row["metadata"] else {}
    if row["provenance"] == "heuristic":
        return "inferred"
    if meta.get("resolvedBy") == "fuzzy" or (meta.get("confidence") is not None and meta["confidence"] < 0.8):
        return "inferred"
    return "observed"


def normalize(db_path, fixture_dir, cmd, generated_at):
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    nodes = {r["id"]: r for r in con.execute("select * from nodes")}
    idmap, out_nodes, omit_kinds = {}, [], {}
    for r in con.execute("select * from nodes order by file_path, start_line, id"):
        k, fp = r["kind"], r["file_path"]
        if k == "file":
            nid, kind = fp, "module"
        elif k in ("class", "interface"):
            nid, kind = f"{fp}::{r['qualified_name']}", "class"
        elif k == "method":
            nid, kind = f"{fp}::{r['qualified_name'].replace('::', '.')}", "method"
        elif k == "function":
            nid, kind = f"{fp}::{r['qualified_name']}", "function"
        else:
            omit_kinds[k] = omit_kinds.get(k, 0) + 1
            continue
        idmap[r["id"]] = nid
        out_nodes.append({"id": nid, "kind": kind, "language": r["language"], "file": fp,
                          "line": r["start_line"], "engine_native_id": r["id"]})
    type_of = {"contains": "contains", "calls": "calls", "instantiates": "calls", "imports": "imports"}
    out_edges, dropped = [], {}
    for r in con.execute("select * from edges order by id"):
        t = type_of.get(r["kind"])
        if t is None:
            dropped[r["kind"]] = dropped.get(r["kind"], 0) + 1
            continue
        s, d = idmap.get(r["source"]), idmap.get(r["target"])
        if s is None or d is None:
            key = "unmapped-endpoint:" + r["kind"]
            dropped[key] = dropped.get(key, 0) + 1
            continue
        out_edges.append({"type": t, "from": s, "to": d, "file": nodes[r["source"]]["file_path"],
                          "line": r["line"], "basis": basis_of(r),
                          "engine_native_id": f"{r['source']}|{r['kind']}|{r['target']}"})
    unk_other = {}
    n_unknown = 0
    for r in con.execute("select * from unresolved_refs order by file_path, line, reference_name"):
        if r["reference_kind"] not in ("calls", "imports"):
            unk_other[r["reference_kind"]] = unk_other.get(r["reference_kind"], 0) + 1
            continue
        src = idmap.get(r["from_node_id"])
        if src is None:
            unk_other["unmapped-source"] = unk_other.get("unmapped-source", 0) + 1
            continue
        n_unknown += 1
        out_edges.append({"type": r["reference_kind"], "from": src, "to": None,
                          "target_hint": r["reference_name"], "file": r["file_path"], "line": r["line"],
                          "basis": "unknown", "engine_native_id": f"unresolved_refs:{r['id']}"})
    omissions = []
    for k, c in sorted(omit_kinds.items()):
        omissions.append({"what": f"{c} CodeGraph node(s) of kind {k}", "reason": "no envelope node kind (not mapped)"})
    for k, c in sorted(dropped.items()):
        omissions.append({"what": f"{c} CodeGraph edge(s) of kind {k}",
                          "reason": "no envelope edge type or endpoint is not an envelope node (not mapped)"})
    for k, c in sorted(unk_other.items()):
        omissions.append({"what": f"{c} unresolved_refs row(s) of kind {k}", "reason": "not calls/imports (not mapped)"})
    cfg = hashlib.sha256((cmd + "|DO_NOT_TRACK=1|library API init+indexAll").encode()).hexdigest()
    return {
        "envelope_version": "kawalys.graph.v0",
        "source": {"scope": "fixture-copy", "revision": tree_hash(fixture_dir), "fixture_version": "g1-01-v0"},
        "engine": {"name": "codegraph", "version": "1.6.4", "config_digest": cfg},
        "generated_at": generated_at,
        "nodes": sorted(out_nodes, key=lambda n: n["id"]),
        "edges": out_edges,
        "omissions": omissions,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("db")
    ap.add_argument("fixture_dir")
    ap.add_argument("out")
    ap.add_argument("--cmd", default="node cg_run.js <fixture-copy>  (CodeGraph.init + indexAll, library API)")
    a = ap.parse_args()
    ts = datetime.datetime.fromtimestamp(os.path.getmtime(a.db), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    env = normalize(a.db, a.fixture_dir, a.cmd, ts)
    with open(a.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(env, fh, indent=2)
        fh.write("\n")
    print(f"[OK] {len(env['nodes'])} nodes, {len(env['edges'])} edges, {len(env['omissions'])} omissions -> {a.out}")


if __name__ == "__main__":
    main()
