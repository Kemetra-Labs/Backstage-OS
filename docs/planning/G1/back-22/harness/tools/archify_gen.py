"""Generate Archify HTML offline for each density, record validator diagnostics, write public/data/archify-manifest.json.
Variants per dataset: 'full' = every node/edge on the SHARED layout (what the other two renderers draw);
'modules' = reduced scope (module nodes + stubs, no contains edges). One attempt each, NO repair rounds.
Usage: python -B archify_gen.py <harness_dir> <vendor_dir>
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

H = Path(sys.argv[1])
V = Path(sys.argv[2])
WORK = V / "archify-work"
(WORK / "in").mkdir(exist_ok=True)
(WORK / "out").mkdir(exist_ok=True)
manifest, log = {}, []
for ds in ("fixture-35", "synthetic-60", "synthetic-250"):
    env = json.loads((H / "public/data" / f"{ds}.envelope.json").read_text(encoding="utf-8"))
    real_nodes, real_edges = len(env["nodes"]), len(env["edges"])
    stubs = sum(1 for e in env["edges"] if e["to"] is None)
    row = {"dataset": ds, "full_scope": f"{real_nodes} nodes, {real_edges} edges", "variants": {}}
    for variant in ("full", "modules"):
        name = f"{ds}-{variant}"
        inp = WORK / "in" / f"{name}.json"
        conv = subprocess.run(["node", str(H / "tools/to-archify.mjs"), str(H / "public/data" / f"{ds}.envelope.json"), str(inp), f"{name}.html",
                               "shared" if variant == "full" else "modules"], capture_output=True, text=True)
        m = re.search(r"nodes (\d+) connections (\d+)", conv.stdout)
        n_nodes, n_conn = (int(m.group(1)), int(m.group(2))) if m else (None, None)
        t0 = time.time()
        r = subprocess.run(["sh", str(V / "run-archify.sh"), "render", "architecture", f"in/{name}.json", f"out/{name}.html", "--quality", "standard"],
                           capture_output=True, text=True, timeout=300)
        dt = round(time.time() - t0, 2)
        err = (r.stderr or "") + (r.stdout if r.returncode else "")
        codes = {}
        for c in re.findall(r"\[([a-z-]+/[a-z-]+)\]", err):
            codes[c] = codes.get(c, 0) + 1
        sub = len(re.findall(r"Sublabel", err))
        lab = len(re.findall(r"Label \"", err))
        out_file = WORK / "out" / f"{name}.html"
        ok = r.returncode == 0 and out_file.exists()
        row["variants"][variant] = {"ok": ok, "components": n_nodes, "connections": n_conn, "seconds": dt, "diagnostic_codes": codes,
                                    "sublabel_overflow": sub, "label_overlap": lab, "bytes": out_file.stat().st_size if ok else None,
                                    "stderr_head": err[:300].replace("\n", " | ")}
        log.append(row)
    full, mod = row["variants"]["full"], row["variants"]["modules"]
    if full["ok"]:
        manifest[ds] = {"status": "generated", "file": f"{ds}-full.html", "scope": f"Archify: full graph ({full['components']} components, {full['connections']} connections)"}
    elif mod["ok"]:
        manifest[ds] = {"status": "generated", "file": f"{ds}-modules.html",
                        "scope": f"Archify REDUCED SCOPE: {mod['components']} of {real_nodes + stubs} components ({real_nodes} nodes + {stubs} unresolved stubs), {mod['connections']} of {real_edges} edges (modules only, no contains edges). Full graph failed validation: {full['diagnostic_codes'].get('layout/constraint', 0)} layout violations."}
    else:
        manifest[ds] = {"status": "not-generated", "reason": f"validator rejected both variants. full: {full['diagnostic_codes']} ; modules: {mod['diagnostic_codes']}"}
(H / "public/data/archify-manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
(V / "archify-gen-log.json").write_text(json.dumps(log, indent=1), encoding="utf-8")
for r in log:
    for k, v in r["variants"].items():
        print(r["dataset"], k, {x: v[x] for x in ("ok", "components", "connections", "seconds", "diagnostic_codes", "sublabel_overflow", "label_overlap", "bytes")})
