"""Per-case-class breakdown of the two BACK-77 score files (read-only; changes no score).

Usage: python3 -B breakdown.py   (run from this folder or anywhere; paths are relative to this file)

Case classes are the `case` tags that holdout-v1/ground-truth.json already carries on every edge and negative.
Edges with no tag are reported as `(no case tag)`. One edge can carry two tags, so the rows overlap and do not
sum to 114. TP/FN come from the scorer's own `missed` list; label findings from its `understated`/`overclaimed`
lists; negatives from `negatives_hit`; unknowns from `unknown`. Nothing is re-scored here.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GT = os.path.join(HERE, "..", "holdout-v1", "ground-truth.json")
ORDER = ["path_alias", "all_star_import", "conditional_import", "decorator", "inheritance", "default_export",
         "reexport_barrel", "cross_package_collision", "unknown_dynamic", "unknown_http_cross_runtime",
         "omission_coverage", "negative_comment", "negative_string", "negative_shadow", "(no case tag)"]


def load(p):
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def ids_of(lines):
    return {x.split()[0] for x in lines}


def main():
    gt = load(GT)
    res = {e: load(os.path.join(HERE, f"score-{e}.json")) for e in ("graphify", "codegraph")}
    rows = {}
    for e in gt["edges"]:
        for c in e.get("case") or ["(no case tag)"]:
            rows.setdefault(c, {"edges": [], "neg": []})["edges"].append(e)
    for n in gt["negatives"]:
        for c in n["case"]:
            rows.setdefault(c, {"edges": [], "neg": []})["neg"].append(n)
    out = ["case class | truth edges (obs/inf/unk) | negatives | Graphify tp/fn, label, neg hit, unknown | "
           "CodeGraph tp/fn, label, neg hit, unknown"]
    for c in ORDER:
        r = rows.get(c, {"edges": [], "neg": []})
        known = [e for e in r["edges"] if e["basis"] != "unknown"]
        unk = [e for e in r["edges"] if e["basis"] == "unknown"]
        b = lambda x: sum(1 for e in r["edges"] if e["basis"] == x)
        cells = [c, f"{len(r['edges'])} ({b('observed')}/{b('inferred')}/{b('unknown')})", str(len(r["neg"]))]
        for eng in ("graphify", "codegraph"):
            s = res[eng]
            missed = ids_of(s["missed"])
            fn = sorted(e["id"] for e in known if e["id"] in missed)
            tp = len(known) - len(fn)
            und = sorted(i for i in ids_of(s["understated"]) if i in {e["id"] for e in known})
            ovr = sorted(i for i in ids_of(s["overclaimed"]) if i in {e["id"] for e in known})
            neg_ids = {n["id"] for n in r["neg"]}
            hits = sorted({i for h in s["negatives_hit"] for i in h["negatives"] if i in neg_ids})
            ust = {u["edge"]: u["status"] for u in s["unknown"]}
            us = ", ".join(f"{e['id']}={ust[e['id']]}" for e in unk)
            cell = f"{tp}/{len(fn)}" + (f" FN {','.join(fn)}" if fn else "")
            if und:
                cell += f"; understated {','.join(und)}"
            if ovr:
                cell += f"; overclaimed {','.join(ovr)}"
            cell += f"; neg hit {len(hits)}" + (f" ({','.join(hits)})" if hits else "")
            if us:
                cell += f"; {us}"
            cells.append(cell)
        out.append(" | ".join(cells))
    print("\n".join(out))


if __name__ == "__main__":
    main()
