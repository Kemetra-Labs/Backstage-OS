"""Deterministic (seeded) SYNTHETIC kawalys.graph.v0 envelopes for the BACK-22 renderer density test.

Usage: python -B gen_synthetic.py <envelope.schema.json> <score.py> <out_dir>
Writes synthetic-60.envelope.json and synthetic-250.envelope.json and validates each with the
fixture's own validate_schema() (score.py). Not real code: ids are invented, source.scope says so.
"""
import importlib.util
import json
import random
import sys

SCHEMA, SCORE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
REV = "0" * 64


def build(n_nodes, seed):
    rnd = random.Random(seed)
    n_mod = round(n_nodes * 0.46)
    mods = []
    for i in range(n_mod):
        if i % 3 == 2:
            mods.append((f"src/svc/m{i:03d}.py", "python"))
        else:
            mods.append((f"src/web/m{i:03d}.ts", "typescript"))
    nodes = [{"id": p, "kind": "module", "language": l, "file": p, "line": 1} for p, l in mods]
    symbols = {p: [] for p, _ in mods}
    edges = []
    remaining = n_nodes - n_mod
    k = 0
    while remaining > 0:
        p, l = mods[k % n_mod]
        k += 1
        idx = len(symbols[p])
        kind = "class" if (idx % 4 == 1 and remaining >= 2) else "function"
        name = f"{'Cls' if kind == 'class' else 'fn'}{k:03d}"
        sid = f"{p}::{name}"
        nodes.append({"id": sid, "kind": kind, "language": l, "file": p, "line": 3 + idx * 7})
        symbols[p].append(sid)
        edges.append({"type": "contains", "from": p, "to": sid, "file": p, "line": 3 + idx * 7, "basis": "observed"})
        remaining -= 1
        if kind == "class":
            mid = f"{p}::{name}.run"
            nodes.append({"id": mid, "kind": "method", "language": l, "file": p, "line": 4 + idx * 7})
            symbols[p].append(mid)
            edges.append({"type": "contains", "from": sid, "to": mid, "file": p, "line": 4 + idx * 7, "basis": "observed"})
            remaining -= 1
    # imports (mostly forward DAG, a few back edges)
    for i, (p, _) in enumerate(mods):
        for _ in range(rnd.choice([1, 1, 2, 2, 3])):
            j = rnd.randrange(0, i) if i > 0 and rnd.random() > 0.06 else rnd.randrange(0, n_mod)
            if j == i:
                continue
            q = mods[j][0]
            if any(e["type"] == "imports" and e["from"] == p and e["to"] == q for e in edges):
                continue
            edges.append({"type": "imports", "from": p, "to": q, "file": p, "line": 1 + rnd.randrange(1, 9), "basis": "observed"})
    # calls between symbols of imported modules
    imps = [(e["from"], e["to"]) for e in edges if e["type"] == "imports"]
    for a, b in imps:
        if symbols[a] and symbols[b] and rnd.random() < 0.6:
            edges.append({"type": "calls", "from": rnd.choice(symbols[a]), "to": rnd.choice(symbols[b]),
                          "file": a, "line": 10 + rnd.randrange(0, 60), "basis": "observed"})
    # a few reexports
    for a, b in rnd.sample(imps, max(1, len(imps) // 20)):
        edges.append({"type": "reexports", "from": a, "to": b, "file": a, "line": 2, "basis": "observed"})
    # unknown edges (~7 percent of edges; one third have to: null + target_hint, as in the fixture)
    n_unk = max(3, round(len(edges) * 0.07))
    for u in range(n_unk):
        p = mods[rnd.randrange(0, n_mod)][0]
        if u % 3 == 0:
            edges.append({"type": "imports", "from": p, "to": None, "target_hint": f"variable plugin{u} (runtime value)",
                          "file": p, "line": 5 + u, "basis": "unknown"})
        elif u % 3 == 1:
            src = rnd.choice(symbols[p]) if symbols[p] else p
            edges.append({"type": "calls", "from": src, "to": None, "target_hint": f"POST /route{u} -> candidate unresolved",
                          "file": p, "line": 20 + u, "basis": "unknown"})
        else:
            q = mods[rnd.randrange(0, n_mod)][0]
            if q != p:
                edges.append({"type": "imports", "from": p, "to": q, "file": p, "line": 7 + u, "basis": "unknown"})
            else:
                edges.append({"type": "imports", "from": p, "to": None, "target_hint": f"name from config key h{u}",
                              "file": p, "line": 7 + u, "basis": "unknown"})
    return {
        "envelope_version": "kawalys.graph.v0",
        "source": {"scope": f"SYNTHETIC seed={seed} nodes={len(nodes)} (generated for BACK-22; not real code)",
                   "revision": REV, "fixture_version": f"synthetic-{n_nodes}"},
        "engine": {"name": "synthetic-generator", "version": "back-22", "config_digest": f"seed-{seed}"},
        "generated_at": "2026-11-21T00:00:00Z",
        "nodes": nodes, "edges": edges,
        "omissions": [{"what": "everything", "reason": "SYNTHETIC: random graph, no source behind it"}],
    }


spec = importlib.util.spec_from_file_location("score", SCORE)
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)
schema = json.load(open(SCHEMA, encoding="utf-8"))
for n, seed in ((60, 2260), (250, 22250)):
    env = build(n, seed)
    errs = score.validate_schema(env, schema)
    ids = [x["id"] for x in env["nodes"]]
    assert len(ids) == len(set(ids)), "dup ids"
    idset = set(ids)
    bad = [e for e in env["edges"] if e["from"] not in idset or (e["to"] is not None and e["to"] not in idset)]
    cnt = {}
    for e in env["edges"]:
        cnt[e["basis"]] = cnt.get(e["basis"], 0) + 1
    nulls = sum(1 for e in env["edges"] if e["to"] is None)
    print(f"synthetic-{n}: nodes={len(env['nodes'])} edges={len(env['edges'])} basis={cnt} to_null={nulls} schema_errors={errs} dangling_refs={len(bad)}")
    assert not errs and not bad
    with open(f"{OUT}/synthetic-{n}.envelope.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(env, f, indent=1)
