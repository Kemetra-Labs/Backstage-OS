"""SYNTHETIC ADAPTER FIXTURES for BACK-28 (G1-C1 Step 1c).

Hand-built, native-SHAPED inputs for the Graphify and CodeGraph normalizers. They are NOT engine output and NOT an
engine rerun: the raw `graph.json` and `codegraph.db` of BACK-21 are not in the repository, and nothing here
reconstructs their bytes. Field names follow only what back-21/normalize_*.py already read. Paths use the G1 fixture
layout (`src/web/...`, `src/svc/...`) so ids stay valid under the v1 schema; the files do not need to exist.
"""
import copy
import json
import sqlite3

# ------------------------------------------------------------------ Graphify (graph.json shape)


def gnode(nid, label, sf, loc, **kw):
    n = {"id": nid, "label": label, "file_type": "code", "source_file": sf, "source_location": loc}
    n.update(kw)
    return n


def glink(src, tgt, rel, sf, loc, conf="EXTRACTED", **kw):
    e = {"source": src, "target": tgt, "relation": rel, "source_file": sf, "source_location": loc,
         "confidence": conf, "_origin": "ast"}
    e.update(kw)
    return e


def ext_node(nid, label):
    return {"id": nid, "label": label, "file_type": "concept", "external": True}


ORD, PRI, IDX = "src/web/orders.ts", "src/web/pricing.ts", "src/web/index.ts"
OLS, INI, SVC = "src/web/OrderList.tsx", "src/svc/__init__.py", "src/svc/service.py"
REP, FMT, GW = "src/web/report.js", "src/web/format.js", "src/svc/gateway.py"


def graphify_base():
    """A graph.json-shaped dict covering imports, re-exports, a barrel, Python __init__, externals, inferred calls."""
    nodes = [
        gnode("m_ord", "orders.ts", ORD, "L1"), gnode("m_pri", "pricing.ts", PRI, "L1"),
        gnode("m_idx", "index.ts", IDX, "L1"), gnode("m_ols", "OrderList.tsx", OLS, "L1"),
        gnode("m_ini", "__init__.py", INI, "L1"), gnode("m_svc", "service.py", SVC, "L1"),
        gnode("m_rep", "report.js", REP, "L1"), gnode("m_fmt", "format.js", FMT, "L1"),
        gnode("m_gw", "gateway.py", GW, "L1"),
        gnode("s_cart", "Cart", PRI, "L5", _callable_class=True),
        gnode("s_add", ".addItem()", PRI, "L7", _callable=True),
        gnode("s_total", "computeTotal()", PRI, "L20", _callable=True),
        gnode("s_build", "buildOrder()", ORD, "L8", _callable=True),
        gnode("s_os", "OrderService", SVC, "L10", _callable_class=True),
        gnode("s_money", "formatMoney()", FMT, "L3", _callable=True),
        ext_node("ref_react", "react"), ext_node("ref_json", "json"), ext_node("ref_requests", "requests"),
    ]
    links = [
        # orders.ts:3 imports two symbols from ./pricing; orders.ts:7 is a second statement from the same file
        glink("m_ord", "m_pri", "imports_from", ORD, "L3"),
        glink("m_ord", "s_cart", "imports", ORD, "L3"),
        glink("m_ord", "s_total", "imports", ORD, "L3"),
        glink("m_ord", "m_pri", "imports_from", ORD, "L7"),
        # OrderList.tsx:4 imports buildOrder through the ./index barrel; :3 is an external import
        glink("m_ols", "ref_react", "imports_from", OLS, "L3"),
        glink("m_ols", "m_idx", "imports_from", OLS, "L4"),
        glink("m_ols", "s_build", "imports", OLS, "L4"),
        # index.ts:2 export { buildOrder } from './orders' (module and symbol variants); :3 export * from './pricing'
        glink("m_idx", "m_ord", "re_exports", IDX, "L2"),
        glink("m_idx", "s_build", "re_exports", IDX, "L2"),
        glink("m_idx", "m_pri", "re_exports", IDX, "L3"),
        # svc/__init__.py:2 from .service import OrderService (+ __all__): engine emits re_exports, no imports_from
        glink("m_ini", "m_svc", "re_exports", INI, "L2"),
        glink("m_ini", "s_os", "re_exports", INI, "L2"),
        glink("m_ini", "s_os", "imports", INI, "L2"),
        # CommonJS require
        glink("m_rep", "m_fmt", "imports_from", REP, "L2"),
        glink("m_rep", "s_money", "imports", REP, "L2"),
        # externals
        glink("m_gw", "ref_json", "imports", GW, "L3"),
        glink("m_gw", "ref_requests", "imports_from", GW, "L5"),
        glink("s_build", "ref_requests", "calls", ORD, "L15"),
        # contains / method (the engine's own link line differs from the child's definition line)
        glink("m_ord", "s_build", "contains", ORD, "L99"),
        glink("m_pri", "s_cart", "contains", PRI, "L5"),
        glink("s_cart", "s_add", "method", PRI, "L7"),
        # calls
        glink("s_build", "s_total", "calls", ORD, "L9"),
        glink("s_build", "s_add", "calls", ORD, "L10", conf="INFERRED"),
        glink("s_build", "s_total", "indirect_call", ORD, "L12"),
        glink("s_build", "s_total", "calls", ORD, "L13", _origin="llm"),
        glink("s_build", "s_cart", "calls", ORD, None),  # no source_location: must never get a guessed line
        # documentation link, not an envelope edge
        glink("s_build", "m_ord", "rationale_for", ORD, "L8"),
    ]
    return {"graph": {"graphify_version": "synthetic"}, "nodes": nodes, "links": links}


def graphify_variant(drop=(), add=()):
    """Copy of the base graph without links for which `drop(link)` is true, plus extra links."""
    g = copy.deepcopy(graphify_base())
    g["links"] = [e for e in g["links"] if not any(d(e) for d in drop)] + list(add)
    return g


# ------------------------------------------------------------------ CodeGraph (codegraph.db shape)

SCHEMA = """
create table nodes(id text primary key, kind text, name text, qualified_name text, file_path text,
                   language text, start_line integer);
create table edges(id integer primary key autoincrement, source text, target text, kind text,
                   metadata text, line integer, col integer, provenance text);
create table unresolved_refs(id integer primary key autoincrement, from_node_id text, reference_name text,
                             reference_kind text, line integer, col integer, file_path text, language text,
                             status text);
create table files(path text primary key, language text);
"""


def _meta(resolved_by=None, confidence=None):
    d = {}
    if resolved_by is not None:
        d["resolvedBy"] = resolved_by
    if confidence is not None:
        d["confidence"] = confidence
    return json.dumps(d) if d else None


def build_codegraph_db(path, with_files_table=True):
    """Write a codegraph.db-shaped sqlite file at `path` (SYNTHETIC)."""
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    ts = "typescript"
    nodes = [
        ("file:ord", "file", "orders.ts", "orders.ts", ORD, ts, 1),
        ("file:pri", "file", "pricing.ts", "pricing.ts", PRI, ts, 1),
        ("file:idx", "file", "index.ts", "index.ts", IDX, ts, 1),
        ("file:ols", "file", "OrderList.tsx", "OrderList.tsx", OLS, "tsx", 1),
        ("class:cart", "class", "Cart", "Cart", PRI, ts, 5),
        ("method:add", "method", "addItem", "Cart::addItem", PRI, ts, 7),
        ("fn:total", "function", "computeTotal", "computeTotal", PRI, ts, 20),
        ("fn:build", "function", "buildOrder", "buildOrder", ORD, ts, 8),
        ("var:x", "variable", "x", "x", ORD, ts, 2),
    ]
    con.executemany("insert into nodes values(?,?,?,?,?,?,?)", nodes)
    E = []  # (source, target, kind, metadata, line, provenance)
    # imports: orders.ts:3 two symbols (+ file edge), second statement at :7; OrderList.tsx:4 through the barrel
    E += [("file:ord", "file:pri", "imports", _meta("import", 1.0), 3, None),
          ("file:ord", "class:cart", "imports", _meta("import", 1.0), 3, None),
          ("file:ord", "fn:total", "imports", _meta("import", 1.0), 3, None),
          ("file:ord", "file:pri", "imports", _meta("import", 1.0), 7, None),
          ("file:ols", "file:idx", "imports", _meta("import", 1.0), 4, None),
          ("file:ols", "fn:build", "imports", _meta("import", 1.0), 4, None),
          ("file:idx", "file:ord", "imports", _meta("import", 1.0), 2, None)]
    # contains: no line in the DB
    E += [("file:ord", "fn:build", "contains", None, None, None),
          ("file:pri", "class:cart", "contains", None, None, None),
          ("class:cart", "method:add", "contains", None, None, None)]
    # calls, one per resolution method
    E += [("fn:build", "fn:total", "calls", _meta("import", 0.95), 9, "tree-sitter"),
          ("fn:build", "method:add", "calls", _meta("instance-method", 0.9), 10, None),
          ("fn:build", "class:cart", "instantiates", _meta("exact-match", 1.0), 11, None),
          ("fn:build", "fn:total", "calls", _meta("fuzzy", 0.5), 12, None),
          ("fn:build", "fn:total", "calls", _meta("import", 0.95), 13, "heuristic"),
          ("fn:build", "fn:total", "calls", _meta("import", 0.5), 14, None),
          ("fn:build", "class:cart", "calls", _meta("import", 0.95), None, None),  # no line
          ("fn:build", "fn:total", "references", None, 15, None)]
    con.executemany("insert into edges(source,target,kind,metadata,line,col,provenance) values(?,?,?,?,?,0,?)", E)
    U = [("file:ols", "react", "imports", 3, OLS, "unresolved"),
         ("fn:build", "pluginPath", "calls", 5, ORD, "unresolved"),
         ("fn:build", "somedecorator", "decorates", 6, ORD, "unresolved"),
         ("var:x", "orphan", "calls", 2, ORD, "unresolved"),
         ("fn:build", "noline", "calls", None, ORD, "unresolved")]
    con.executemany("insert into unresolved_refs(from_node_id,reference_name,reference_kind,line,col,file_path,"
                    "language,status) values(?,?,?,?,0,?,'typescript',?)", U)
    if with_files_table:
        con.executemany("insert into files values(?,?)", [(ORD, ts), (PRI, ts), (IDX, ts), (OLS, "tsx")])
    else:
        con.execute("drop table files")
    con.commit()
    con.close()
