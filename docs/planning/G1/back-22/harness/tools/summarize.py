"""Turn checks-run1.json / checks-run2.json into checks.txt. Usage: python -B summarize.py <back22_dir>"""
import json
import sys
from pathlib import Path

D = Path(sys.argv[1])
R1 = json.loads((D / "checks-run1.json").read_text(encoding="utf-8"))
R2 = json.loads((D / "checks-run2.json").read_text(encoding="utf-8"))
A, B = R1["chromium"], R2["chromium"]
RN = ["depgraph", "reactflow", "archify"]
L = []


def w(s=""):
    L.append(s)


def flat(x, p=""):
    if isinstance(x, dict):
        for k, v in x.items():
            yield from flat(v, f"{p}/{k}")
    else:
        yield p, json.dumps(x)


w("BACK-22 renderer checks (Playwright Python 1.62.0, Chromium %s headless shell, cached; no browser downloaded)" % R1["chromium_version"])
w(f"run 1 started {R1['started']} (with --webkit attempt), run 2 started {R2['started']}")
w("Harness: http://127.0.0.1:5190 (strict CSP: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src http://127.0.0.1:5191; object-src 'none'; base-uri 'none'; form-action 'none')")
w("Archify frame: http://127.0.0.1:5191 (FINAL CSP: default-src 'none'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self'; img-src data: 'self'; font-src data:; connect-src 'none'; frame-ancestors http://127.0.0.1:5190), iframe sandbox=\"allow-scripts\" only")
w("Fixture checks use fixture-35 (35 nodes, 44 edges, 3 unresolved stubs). Functional results were compared leaf by leaf between run 1 and run 2.")
fa, fb = dict(flat({k: v for k, v in A.items() if k != "perf"})), dict(flat({k: v for k, v in B.items() if k != "perf"}))
diff = [k for k in sorted(set(fa) | set(fb)) if fa.get(k) != fb.get(k)]
w(f"Functional leaf values that differ between run 1 and run 2 (everything except perf): {len(diff)}" + ("" if not diff else " -> " + "; ".join(diff[:10])))
w()


def sect(title, key, fields=None):
    w("=" * 78)
    w(title)
    w("=" * 78)
    for r in RN:
        v = A[key][r]
        w(f"[{r}] run1: " + json.dumps(v, ensure_ascii=True)[:1400])
    w()


sect("1. Click-select shows evidence", "select")
sect("2. Keyboard: Tab reaches nodes, Enter selects, focus visible", "keyboard")
sect("3. Edge classification (computed dash + marker per truth class)", "edges")
sect("4. Zoom in/out/reset", "zoom")
sect("5. Return navigation (Escape / clear)", "return_nav")
sect("6. Table fallback (expected 35 node rows, 44 edge rows)", "tables")
sect("7. Arabic: dir=rtl on panels, canvas ltr, Latin runs isolated", "i18n_ar")
sect("8. Screen-reader semantics found in DOM (real screen reader = NOT RUN)", "semantics")
w("=" * 78)
w("9. prefers-reduced-motion: running animations via document.getAnimations()")
w("=" * 78)
for r in RN:
    w(f"[{r}] run1: " + json.dumps(A["reduced_motion"][r])[:1200])
w()
w("=" * 78)
w("10. Viewports: horizontal page overflow and touch targets (<44px) at 375")
w("=" * 78)
for r in RN:
    for wd in ("320", "375", "1440"):
        for view in ("graph", "table"):
            x = A["viewports"][r][wd][view]
            t = x.get("touch_host")
            line = f"[{r}] {wd}px {view}: page_overflow={x['page_overflow']} (scrollWidth {x['scrollWidth']}/{x['innerWidth']}) offenders={x['offenders']}"
            if t:
                line += f" | host controls {t['total']}, below 44px: {t['small']} (chrome {t['small_chrome']}, canvas {t['small_canvas']})"
            if "touch_frame" in x:
                tf = x["touch_frame"]
                line += f" | archify frame controls {tf['total']}, below 44px: {tf['small']}; frame overflow={x['frame_overflow']['page_overflow']}"
            w(line)
        if wd == "375":
            t = A["viewports"][r][wd]["graph"]["touch_host"]
            w(f"    samples below 44px (graph view): {json.dumps(t['samples'])[:420]}")
w()
w("=" * 78)
w("11. axe-core 4.14.1 violations (host page unless stated)")
w("=" * 78)
for r in RN:
    for k, x in A["axe"][r].items():
        same = x == B["axe"][r][k]
        w(f"[{r}] {k}: total {x['violations_total']} by impact {x['by_impact']} rules {x['rules']} (run2 identical: {same})")
w()
w("=" * 78)
w("12. Performance at three densities (Chromium headless shell, 1440x900, local; run 1 | run 2)")
w("graph_complete = navigation start -> all nodes+edges in DOM (+ RF viewport fitted); data_to_render = envelope parsed -> 2 rAF after mount;")
w("dom_canvas / svg_canvas = elements inside the canvas; longtasks via PerformanceObserver; heap = performance.memory (coarse, bucketed by Chromium).")
w("Archify rows: host numbers are the iframe host only; frame = generated page's own navigation timing and DOM. 60/250: NOT GENERATED (validator) -> NOT RUN.")
w("=" * 78)
for ds in ("fixture-35", "synthetic-60", "synthetic-250"):
    for r in RN:
        for tag, X in (("run1", A), ("run2", B)):
            x = X["perf"][ds][r]
            if "error" in x:
                w(f"{ds} {r} {tag}: ERROR {x['error']}")
                continue
            parts = [f"complete={x.get('graph_complete_ms')}ms", f"data_to_render={x['data_to_render_ms']}ms", f"dom_canvas={x['dom_canvas']}", f"svg_canvas={x['svg_elements_canvas']}",
                     f"dom_total={x['dom_total']}", f"longtasks={x['longtasks']} ({x['longtask_total_ms']}ms)", f"heap={x['heap_mb']}MB"]
            if r == "archify":
                parts = [f"artifact={x.get('artifact')}"] + (["frame=" + json.dumps(x["frame"])] if "frame" in x else ["frame metrics NOT RUN"]) + [f"host dom_total={x['dom_total']}"]
            w(f"{ds} {r} {tag}: " + ", ".join(parts))
w()
w("=" * 78)
w("13. Network requests per page (functional fixture load + one selection), strict CSP console violations")
w("=" * 78)
for r in RN:
    w(f"[{r}] run1: {json.dumps(A['network'][r])[:700]}")
    w(f"[{r}] run2: {json.dumps(B['network'][r])[:700]}")
w()
w("=" * 78)
w("14. WebKit")
w("=" * 78)
w("run 1 attempt: " + json.dumps(R1.get("webkit"))[:900])
w("Playwright 1.62.0 expects webkit revision 2336 (browsers.json); the cached build is webkit-2388 (WebKit 26.5). Launch works, every new_page fails: NOT RUN. No browser was downloaded.")
(D / "checks.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
print(len(L), "lines")
