"""Canonical content hash of a CodeGraph DB (BACK-21 runs.md column list; timestamps and autoincrement ids excluded)."""
import hashlib, json, sqlite3, sys
COLS = {
 "nodes": ["id","kind","name","qualified_name","file_path","language","start_line","end_line","start_column","end_column","signature","is_exported"],
 "edges": ["source","target","kind","metadata","line","col","provenance"],
 "files": ["path","content_hash","language","size","node_count","errors"],
 "unresolved_refs": ["from_node_id","reference_name","reference_kind","line","col","file_path","language","status"],
}
con = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
h = hashlib.sha256(); counts = {}
for t, cols in COLS.items():
    have = [r[1] for r in con.execute(f"pragma table_info({t})")]
    miss = [c for c in cols if c not in have]
    use = [c for c in cols if c in have]
    rows = sorted(json.dumps(list(r), default=str) for r in con.execute(f"select {','.join(use)} from {t}"))
    counts[t] = {"rows": len(rows), "missing_cols": miss}
    h.update(t.encode() + b"\0" + "\n".join(rows).encode() + b"\0")
print(json.dumps({"canonical_sha256": h.hexdigest(), "tables": counts}))
