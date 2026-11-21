import os
"""BACK-22 Playwright checks (Python, Chromium headless shell from the local cache; WebKit if cached).
Usage: python -B checks.py <harness_dir> <out_json> [--webkit]
One comprehensive script: functional, keyboard, edge classes, zoom, return nav, tables, EN/AR, reduced motion,
viewports/overflow/touch targets, axe, perf at 3 densities, network + CSP console log. Results go to <out_json>.
Never uses bypass_csp. axe is injected through CDP evaluate (not a script tag).
"""
import glob
import json
import re
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

H = Path(sys.argv[1])
OUT = Path(sys.argv[2])
WEBKIT = "--webkit" in sys.argv
CHROME = glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-*\chrome-headless-shell-win64\chrome-headless-shell.exe"))[0]
WEBKIT_EXE = os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright\webkit-2388\Playwright.exe")
BASE = "http://127.0.0.1:5190"
ARCH = "http://127.0.0.1:5191"
AXE = (H / "node_modules/axe-core/axe.min.js").read_text(encoding="utf-8")
RENDERERS = ["depgraph", "reactflow", "archify"]
ENV = json.loads((H / "public/data/fixture-35.envelope.json").read_text(encoding="utf-8"))
KEY = {n["id"]: f"n{i}" for i, n in enumerate(ENV["nodes"])}
SEL_ID = "src/web/orders.ts"
SEL_KEY = KEY[SEL_ID]
EXPECT_NODES, EXPECT_EDGES = len(ENV["nodes"]), len(ENV["edges"])
NODE_SEL = {"depgraph": f'button[data-node="{SEL_KEY}"]', "reactflow": f'.react-flow__node[data-id="{SEL_KEY}"]'}


class Watch:
    """Collects requests, failures and console output for a page and all its frames."""
    def __init__(self, page):
        self.requests, self.failed, self.console = [], [], []
        page.on("request", lambda q: self.requests.append(q.url))
        page.on("requestfailed", lambda q: self.failed.append(f"{q.url[:100]} {q.failure}"))
        page.on("console", lambda m: self.console.append(f"{m.type}: {m.text[:400]}"))
        page.on("pageerror", lambda e: self.console.append(f"pageerror: {str(e)[:160]}"))

    def summary(self):
        ext = [u for u in self.requests if not (u.startswith(BASE) or u.startswith(ARCH) or u.startswith("data:") or u.startswith("blob:") or u.startswith("about:"))]
        pat = re.compile(r"Content Security Policy|Refused to|Loading the (font|image|script|stylesheet)|violates")
        csp = [c for c in self.console if pat.search(c)]
        return {"requests": len(self.requests), "same_origin": sum(u.startswith(BASE) for u in self.requests),
                "archify_origin": sum(u.startswith(ARCH) for u in self.requests), "data_blob": sum(u.startswith(("data:", "blob:")) for u in self.requests),
                "external": ext, "failed": self.failed[:6], "csp_console": len(csp), "csp_samples": sorted({re.sub(r"data:[^ ']{20,}", "data:...", c)[:150] for c in csp})[:4],
                "console_other": [c for c in self.console if c not in csp][:5]}


def expected_counts(data):
    env = json.loads((H / f"public/data/{data}.envelope.json").read_text(encoding="utf-8"))
    return len(env["nodes"]) + sum(1 for e in env["edges"] if e["to"] is None), len(env["edges"])


COMPLETE_JS = r"""(cfg) => { const t0 = performance.now(); window.__kw_complete = null;
  const tick = () => { const n = document.querySelectorAll(cfg.nodeSel).length; const e = cfg.edgeSel ? document.querySelectorAll(cfg.edgeSel).length : -1;
    let ok = n === cfg.nodes && (cfg.edgeSel ? e === cfg.edges : true);
    if (ok && cfg.rf) { const v = document.querySelector('.react-flow__viewport'); const nd = document.querySelector('.react-flow__node'); ok = !!v && /scale\(/.test(v.style.transform) && !!nd && getComputedStyle(nd).visibility !== 'hidden'; }
    if (ok) { window.__kw_complete = Math.round(performance.now()); } else requestAnimationFrame(tick); };
  addEventListener('DOMContentLoaded', () => requestAnimationFrame(tick)); }"""


def goto(ctx, r, data="fixture-35", lang="en", view="graph", sel=None, wait=True, w=None):
    page = ctx.new_page()
    watch = Watch(page)
    if r != "archify" and view == "graph":
        nn, ee = expected_counts(data)
        cfg = {"nodeSel": "button[data-node]" if r == "depgraph" else ".react-flow__node", "edgeSel": "line[data-edge]" if r == "depgraph" else ".react-flow__edge",
               "nodes": nn, "edges": ee, "rf": r == "reactflow"}
        page.add_init_script(f"({COMPLETE_JS})({json.dumps(cfg)})")
    q = f"?data={data}&lang={lang}&view={view}" + (f"&sel={sel}" if sel else "")
    page.goto(f"{BASE}/{r}.html{q}", wait_until="load")
    if wait:
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
    return page, watch


def frame_of(page):
    fr = [f for f in page.frames if f != page.main_frame]
    return fr[0] if fr else None


def insp_node(page):
    return page.evaluate("() => document.querySelector('[data-testid=insp-body]')?.getAttribute('data-node') || null")


def insp_text(page):
    return page.evaluate("() => document.querySelector('[data-testid=inspector]')?.innerText || ''")


def active(page, r):
    """Describe the active element, descending into the Archify iframe."""
    js = """() => { let e = document.activeElement; if (!e) return null;
      const d = (x) => ({tag: x.tagName, cls: (x.getAttribute('class')||'').slice(0,60), node: x.getAttribute('data-node')||x.getAttribute('data-id')||x.getAttribute('data-node-id')||null,
        fv: (()=>{try{return x.matches(':focus-visible')}catch(e){return null}})(), outline: getComputedStyle(x).outlineStyle + ' ' + getComputedStyle(x).outlineWidth,
        shadow: getComputedStyle(x).boxShadow !== 'none', role: x.getAttribute('role'), pressed: x.getAttribute('aria-pressed')});
      return d(e); }"""
    a = page.evaluate(js)
    if a and a["tag"] == "IFRAME":
        fr = frame_of(page)
        a = fr.evaluate(js)
        a["in_frame"] = True
    return a


def is_node(a, r):
    if not a:
        return False
    if r == "depgraph":
        return a["tag"] == "BUTTON" and a["node"] is not None
    if r == "reactflow":
        return "react-flow__node" in a["cls"]
    return a.get("in_frame") and a["node"] is not None and a["tag"].lower() == "g"


def t_select(ctx, r):
    res = {}
    page, _ = goto(ctx, r)
    if r == "archify":
        fr = frame_of(page)
        node = fr.locator(f'g[data-node-id="{SEL_KEY}"]')
        node.click()
        page.wait_for_timeout(300)
        res["frame_node_aria_pressed_after_click"] = node.get_attribute("aria-pressed")
        res["frame_detail_text"] = (fr.evaluate("() => (document.getElementById('focus-detail')||{}).innerText || ''") or "")[:140].replace("\n", " | ")
        res["shared_inspector_node_after_click"] = insp_node(page)
        res["parity"] = "NO: selection inside the sandboxed frame cannot reach the shared inspector (no allow-same-origin, no postMessage bridge, generated HTML not patched)"
        # table row selection (host side, same for all renderers) still updates the shared inspector
        page.click('[data-testid=view-table]')
        page.click(f'tr[data-node="{SEL_KEY}"] button')
        res["shared_inspector_via_table_row"] = insp_node(page)
    else:
        page.click(NODE_SEL[r])
        page.wait_for_timeout(200)
        res["inspector_node"] = insp_node(page)
        txt = insp_text(page)
        res["inspector_has_evidence_file_line"] = bool(re.search(r"src/web/orders\.ts:\d+", txt))
        res["inspector_edges_listed"] = page.evaluate("() => document.querySelectorAll('[data-testid=insp-body] li.ed').length")
        res["inspector_basis_words"] = sorted(set(re.findall(r"Observed|Unknown", txt)))
        res["selected_visual"] = page.evaluate(f"() => {{ const e = document.querySelector('{NODE_SEL[r]}'); const s = getComputedStyle(e); return {{borderColor: s.borderColor, ariaPressed: e.getAttribute('aria-pressed'), cls: e.className.toString().slice(0,80)}}; }}")
        # unresolved stub selection
        ukey = [n for n in range(len(ENV["nodes"]), len(ENV["nodes"]) + 3)]
        stub = f"u0"
        sel = NODE_SEL[r].replace(SEL_KEY, stub)
        page.click(sel)
        res["unresolved_stub_inspector_text"] = insp_text(page)[:120].replace("\n", " | ")
    page.close()
    return res


def t_keyboard(ctx, r):
    res = {}
    page, _ = goto(ctx, r)
    page.evaluate("() => document.body.focus()")
    first = None
    presses = 0
    for i in range(1, 90):
        page.keyboard.press("Tab")
        a = active(page, r)
        if is_node(a, r):
            first, presses = a, i
            break
    res["tab_presses_to_first_node"] = presses if first else None
    if first:
        res["first_node_focus_visible"] = {"matches_focus_visible": first["fv"], "outline": first["outline"], "boxshadow": first["shadow"]}
        if r == "reactflow":
            before = page.evaluate("() => document.querySelector('.react-flow__node:focus')?.style.transform")
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        a2 = active(page, r)
        if r == "archify":
            res["enter_selects"] = (a2 or {}).get("pressed")
            res["enter_selects_note"] = "aria-pressed of the focused frame node after Enter"
            res["shared_inspector_updated"] = insp_node(page) is not None
        else:
            res["enter_selects"] = insp_node(page) == first["node"]
        if r == "reactflow":
            page.keyboard.press("ArrowRight")
            page.wait_for_timeout(200)
            after = page.evaluate("() => document.querySelector('.react-flow__node:focus')?.style.transform")
            res["arrow_key_moves_node"] = {"before": before, "after": after, "moved": before != after}
        # Space also?
        page.keyboard.press("Tab")
        a3 = active(page, r)
        res["second_tab_target"] = (a3 or {}).get("node") or (a3 or {}).get("cls")
    page.close()
    return res


def t_edges(ctx, r):
    res = {}
    page, _ = goto(ctx, r)
    if r == "depgraph":
        js = """() => { const out = {}; document.querySelectorAll('line[data-edge]').forEach(l => { const s = getComputedStyle(l);
          const k = (l.classList.contains('dg-authored') ? 'observed' : 'unknown'); const m = l.getAttribute('marker-end');
          out[k] = out[k] || new Set(); out[k].add(s.strokeDasharray + ' | ' + m); }); return Object.fromEntries(Object.entries(out).map(([k,v]) => [k,[...v]])); }"""
        res["classes"] = page.evaluate(js)
        res["edges_drawn"] = page.evaluate("() => document.querySelectorAll('line[data-edge]').length")
    elif r == "reactflow":
        js = """() => { const out = {}; document.querySelectorAll('.react-flow__edge').forEach(g => { const p = g.querySelector('.react-flow__edge-path'); const s = getComputedStyle(p);
          const k = g.classList.contains('kw-edge-obs') ? 'observed' : 'unknown'; out[k] = out[k] || new Set(); out[k].add(s.strokeDasharray + ' | ' + (p.getAttribute('marker-end')||'').replace(/^url\\(#?[^)]*(arrow|circle)[^)]*\\)/, 'marker:$1').slice(0,40)); });
          return Object.fromEntries(Object.entries(out).map(([k,v]) => [k,[...v]])); }"""
        res["classes"] = page.evaluate(js)
        res["edges_drawn"] = page.evaluate("() => document.querySelectorAll('.react-flow__edge').length")
    else:
        fr = frame_of(page)
        js = """() => { const out = {}; document.querySelectorAll('g.relationship, [data-relationship-id], path.relationship-path, path[class*=\"a-\"]').forEach(p => {
          const path = p.tagName === 'path' ? p : p.querySelector('path'); if (!path) return; const s = getComputedStyle(path);
          const cls = (path.getAttribute('class')||'').split(' ').filter(c => /^a-/.test(c)).join(' ') || 'other';
          out[cls] = out[cls] || new Set(); out[cls].add(s.strokeDasharray + ' | ' + (path.getAttribute('marker-end')||'none')); });
          return Object.fromEntries(Object.entries(out).map(([k,v]) => [k,[...v]])); }"""
        res["classes"] = fr.evaluate(js)
        res["edges_drawn"] = fr.evaluate("() => document.querySelectorAll('path[class*=\"a-\"]').length")
        res["note"] = "Archify vocabulary is default|emphasis|security|dashed; unknown mapped to dashed (no marker control, no distinct unknown marker)"
    page.close()
    return res


def t_zoom(ctx, r):
    res = {}
    page, _ = goto(ctx, r)
    if r == "depgraph":
        res["supported"] = False
        res["note"] = "no zoom/pan in DepGraph (horizontal scroll only); not added"
    elif r == "reactflow":
        sc = lambda: page.evaluate("() => { const t = document.querySelector('.react-flow__viewport').style.transform; const m = /scale\\(([\\d.]+)\\)/.exec(t); return m ? +m[1] : null; }")
        s0 = sc()
        page.click(".react-flow__controls-zoomin"); page.wait_for_timeout(150); s1 = sc()
        page.click(".react-flow__controls-zoomout"); page.wait_for_timeout(150); page.click(".react-flow__controls-zoomout"); page.wait_for_timeout(150); s2 = sc()
        page.click(".react-flow__controls-fitview"); page.wait_for_timeout(300); s3 = sc()
        res.update({"supported": True, "initial_scale": s0, "after_zoom_in": s1, "after_two_zoom_out": s2, "after_fit_view": s3,
                    "in_works": s1 > s0, "out_works": s2 < s1, "reset_works": abs(s3 - s0) < 0.02,
                    "control_button_size_px": page.evaluate("() => { const b = document.querySelector('.react-flow__controls-zoomin').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }")})
    else:
        fr = frame_of(page)
        label = lambda: fr.evaluate("() => { const e = [...document.querySelectorAll('*')].find(x => /^\\d+%$/.test((x.textContent||'').trim()) && x.children.length === 0); return e ? e.textContent.trim() : null; }")
        l0 = label()
        fr.locator('button[aria-label="Zoom in"]').click(); page.wait_for_timeout(250); l1 = label()
        fr.locator('button[aria-label="Zoom out"]').click(); page.wait_for_timeout(150); fr.locator('button[aria-label="Zoom out"]').click(); page.wait_for_timeout(250); l2 = label()
        res.update({"supported": True, "initial": l0, "after_zoom_in": l1, "after_two_zoom_out": l2, "in_works": l0 != l1, "out_works": l1 != l2,
                    "reset": "label click / fit not probed (NOT RUN)"})
    page.close()
    return res


def t_return(ctx, r):
    res = {}
    page, _ = goto(ctx, r)
    if r == "archify":
        fr = frame_of(page)
        node = fr.locator(f'g[data-node-id="{SEL_KEY}"]')
        node.click(); page.wait_for_timeout(200)
        p1 = node.get_attribute("aria-pressed")
        page.keyboard.press("Escape"); page.wait_for_timeout(250)
        p2 = node.get_attribute("aria-pressed")
        res["frame_escape_clears_selection"] = {"before": p1, "after": p2, "cleared": p1 == "true" and p2 != "true"}
        # shared inspector: select via table row, Escape in the host
        page.click('[data-testid=view-table]'); page.click(f'tr[data-node="{SEL_KEY}"] button'); s1 = insp_node(page)
        page.keyboard.press("Escape"); s2 = insp_node(page)
        res["host_escape_clears_shared_inspector"] = {"before": s1, "after": s2, "cleared": s1 and not s2}
    else:
        page.click(NODE_SEL[r]); s1 = insp_node(page)
        page.keyboard.press("Escape"); page.wait_for_timeout(100); s2 = insp_node(page)
        res["escape_clears"] = {"before": s1, "after": s2, "cleared": bool(s1) and not s2}
        page.click(NODE_SEL[r]); page.click("[data-testid=clear]"); res["clear_button_clears"] = insp_node(page) is None
        if r == "reactflow":
            page.click(NODE_SEL[r]); page.mouse.click(30, 300)  # empty pane area of the canvas
            res["pane_click_clears"] = insp_node(page) is None
    page.close()
    return res


def t_tables(ctx, r):
    page, _ = goto(ctx, r, view="table")
    res = page.evaluate("""() => { const n = document.querySelectorAll('[data-testid=nodes-table] tbody tr'); const e = document.querySelectorAll('[data-testid=edges-table] tbody tr');
      const ev = [...e].filter(t => /:\\d+|no line/.test(t.cells[4].innerText)).length; const unk = [...e].filter(t => t.dataset.truth === 'unknown');
      return {node_rows: n.length, edge_rows: e.length, edge_rows_with_evidence: ev, unknown_rows: unk.length,
              unknown_rows_unresolved_word: unk.filter(t => /Unresolved target/.test(t.cells[1].innerText)).length,
              unknown_rows_basis_word: unk.filter(t => /Unknown/.test(t.cells[3].innerText)).length,
              captions: [...document.querySelectorAll('caption')].map(c => c.innerText), th_scoped: document.querySelectorAll('th[scope]').length}; }""")
    res["complete"] = res["node_rows"] == EXPECT_NODES and res["edge_rows"] == EXPECT_EDGES
    page.close()
    return res


def t_i18n(ctx, r):
    res = {}
    page, _ = goto(ctx, r)
    page.click("[data-testid=lang-ar]")
    page.wait_for_timeout(300)
    if r != "archify":
        page.click(NODE_SEL[r])
    else:
        page.click('[data-testid=view-table]'); page.click(f'tr[data-node="{SEL_KEY}"] button'); page.click('[data-testid=view-graph]'); page.wait_for_timeout(1200)
    res.update(page.evaluate("""() => { const dir = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).direction : null; };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const bad = []; let latin = 0; let n;
      while ((n = walker.nextNode())) { const t = n.textContent; const m = /[A-Za-z_]+[\\w./:-]*[./:][\\w./:-]+/.exec(t); if (!m) continue; if (n.parentElement.closest('.canvas iframe')) continue;
        latin++; if (!n.parentElement.closest('bdi[dir=ltr]')) bad.push(t.trim().slice(0, 50)); }
      return {html_dir: document.documentElement.dir, aside_direction: dir('#inspector'), header_direction: dir('.top'), canvas_attr_dir: document.querySelector('[data-testid=canvas]')?.getAttribute('dir'),
              canvas_direction: dir('[data-testid=canvas]'), latin_runs: latin, latin_runs_not_in_bdi_ltr: bad.slice(0, 5), latin_runs_not_in_bdi_ltr_count: bad.length,
              inspector_arabic_heading: document.querySelector('[data-testid=inspector] h2')?.innerText, side_inline_position: Math.round(document.querySelector('#inspector').getBoundingClientRect().left)}; }"""))
    res["inspector_on_left_in_rtl"] = res["side_inline_position"] < 700
    if r == "depgraph":
        res["node_label_bdi_ltr"] = page.evaluate("() => [...document.querySelectorAll('button[data-node] .dg-name')].every(e => e.tagName === 'BDI' && e.getAttribute('dir') === 'ltr')")
    if r == "reactflow":
        res["node_label_bdi_ltr"] = page.evaluate("() => [...document.querySelectorAll('.kw-name')].every(e => e.tagName === 'BDI' && e.getAttribute('dir') === 'ltr')")
    if r == "archify":
        fr = frame_of(page)
        res["frame_html_dir"] = fr.evaluate("() => document.documentElement.dir + ' / lang=' + document.documentElement.lang")
        res["frame_note"] = "the generated frame is English (Archify has locale support via meta.locale, not exercised: NOT RUN)"
    page.close()
    return res


def anims(page, r):
    main = page.evaluate("() => document.getAnimations().filter(a => a.playState === 'running').length")
    fr_n = None
    if r == "archify" and frame_of(page):
        fr_n = frame_of(page).evaluate("() => document.getAnimations().filter(a => a.playState === 'running').length")
    return main, fr_n


def t_motion(browser):
    res = {}
    for r in RENDERERS:
        out = {}
        for mode in ("no-preference", "reduce"):
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion=mode)
            page, _ = goto(ctx, r)
            page.wait_for_timeout(1200)
            m, f = anims(page, r)
            out[mode] = {"running_animations_page": m, "running_animations_frame": f}
            if r == "archify":
                fr = frame_of(page)
                out[mode]["frame_state"] = fr.evaluate("""() => ({motion: document.documentElement.dataset.motion, ambient: document.documentElement.dataset.ambientMotion,
                    motion_button: [...document.querySelectorAll('button')].map(b => (b.getAttribute('aria-label')||b.textContent||'').trim()).filter(t => /resume motion|pause motion|reduced-motion/i.test(t)).slice(0, 2),
                    smil: document.querySelectorAll('animate, animateMotion, animateTransform').length})""")
                clicked = fr.evaluate("""() => { const b = [...document.querySelectorAll('button')].find(x => /resume motion|reduced-motion/i.test(x.getAttribute('aria-label') || x.textContent || '')); if (!b) return 'no button'; if (b.disabled || b.getAttribute('aria-disabled') === 'true') return 'disabled'; b.click(); return 'clicked'; }""")
                page.wait_for_timeout(1500)
                out[mode]["motion_button"] = clicked
                out[mode]["after_motion_button_click"] = {"running": fr.evaluate("() => document.getAnimations().filter(a => a.playState === 'running').length"),
                                                          "data_motion": fr.evaluate("() => document.documentElement.dataset.motion + '/' + document.documentElement.dataset.ambientMotion")}
            if r != "archify":
                page.click(NODE_SEL[r]); page.wait_for_timeout(300)
                out[mode]["after_select_page"] = anims(page, r)[0]
            ctx.close()
        res[r] = out
    return res


TOUCH_JS = """() => { const sel = 'button, a[href], select, input, textarea, [role=button], [tabindex]:not([tabindex="-1"]):not(iframe)'; const bad = []; let total = 0;
  document.querySelectorAll(sel).forEach(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
    if (e.closest('.skip') || e.matches('.react-flow__attribution a')) { } total++; if (r.width < 44 || r.height < 44) bad.push({tag: e.tagName.toLowerCase(), cls: (e.getAttribute('class')||'').slice(0, 40), label: (e.getAttribute('aria-label')||e.innerText||'').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), canvas: !!e.closest('.canvas')}); });
  return {total, small: bad.length, small_chrome: bad.filter(b => !b.canvas).length, small_canvas: bad.filter(b => b.canvas).length, samples: bad.slice(0, 6)}; }"""
OVERFLOW_JS = """() => { const iw = window.innerWidth; const sw = document.documentElement.scrollWidth; const off = [];
  document.querySelectorAll('body *').forEach(e => { if (e.closest('.canvas, .table-scroll, svg')) return; const r = e.getBoundingClientRect(); if (r.width && r.right > iw + 1) off.push((e.getAttribute('class')||e.tagName).slice(0, 40) + ':' + Math.round(r.right)); });
  return {innerWidth: iw, scrollWidth: sw, page_overflow: sw > iw + 1, offenders: off.slice(0, 4)}; }"""


def t_viewports(browser):
    res = {}
    for r in RENDERERS:
        res[r] = {}
        for w in (320, 375, 1440):
            ctx = browser.new_context(viewport={"width": w, "height": 800}, has_touch=(w < 641), is_mobile=False)
            row = {}
            for view in ("graph", "table"):
                page, _ = goto(ctx, r, view=view)
                row[view] = page.evaluate(OVERFLOW_JS)
                if w == 375:
                    row[view]["touch_host"] = page.evaluate(TOUCH_JS)
                    if r == "archify" and view == "graph" and frame_of(page):
                        fr = frame_of(page)
                        row[view]["touch_frame"] = fr.evaluate(TOUCH_JS)
                        row[view]["frame_overflow"] = fr.evaluate(OVERFLOW_JS)
                page.close()
            res[r][str(w)] = row
            ctx.close()
    return res


def t_axe(browser):
    res = {}
    for r in RENDERERS:
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        out = {}
        for view in ("graph", "table"):
            page, _ = goto(ctx, r, view=view)
            page.evaluate(AXE)
            raw = page.evaluate("async () => { const x = await axe.run(document, {resultTypes: ['violations','incomplete']}); return {v: x.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length})), inc: x.incomplete.map(v => v.id)}; }")
            by = {}
            for v in raw["v"]:
                by[v["impact"]] = by.get(v["impact"], 0) + 1
            out[f"{view}_host"] = {"violations_total": len(raw["v"]), "by_impact": by, "rules": [f"{v['id']}({v['impact']},{v['n']} nodes)" for v in raw["v"]], "incomplete": raw["inc"][:6]}
            if r == "archify" and view == "graph" and frame_of(page):
                fr = frame_of(page)
                fr.evaluate(AXE)
                raw = fr.evaluate("async () => { const x = await axe.run(document, {resultTypes: ['violations']}); return x.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length})); }")
                by = {}
                for v in raw:
                    by[v["impact"]] = by.get(v["impact"], 0) + 1
                out["graph_frame_archify_page"] = {"violations_total": len(raw), "by_impact": by, "rules": [f"{v['id']}({v['impact']},{v['n']} nodes)" for v in raw]}
            page.close()
        # canvas-only run (renderer-owned DOM) for depgraph/reactflow
        if r != "archify":
            page, _ = goto(ctx, r, view="graph")
            page.evaluate(AXE)
            raw = page.evaluate("async () => { const x = await axe.run(document.querySelector('[data-testid=canvas]'), {resultTypes: ['violations']}); return x.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length})); }")
            by = {}
            for v in raw:
                by[v["impact"]] = by.get(v["impact"], 0) + 1
            out["graph_canvas_only"] = {"violations_total": len(raw), "by_impact": by, "rules": [f"{v['id']}({v['impact']},{v['n']} nodes)" for v in raw]}
            page.close()
        ctx.close()
        res[r] = out
    return res


def t_semantics(ctx, r):
    page, _ = goto(ctx, r)
    scope = "[data-testid=canvas]"
    if r == "archify":
        fr = frame_of(page)
        info = fr.evaluate("""() => { const roles = {}; document.querySelectorAll('[role]').forEach(e => roles[e.getAttribute('role')] = (roles[e.getAttribute('role')]||0)+1);
          const nodes = [...document.querySelectorAll('g[data-node-id]')]; return {roles, node_count: nodes.length, nodes_with_aria_label: nodes.filter(n => n.getAttribute('aria-label')).length, nodes_tabbable: nodes.filter(n => n.getAttribute('tabindex') === '0').length,
            edge_hit_targets: document.querySelectorAll('.relationship-hit-target').length, edges_with_label: [...document.querySelectorAll('.relationship-hit-target')].filter(e => e.getAttribute('aria-label') || e.querySelector('title')).length,
            svg_role_img_title: !!document.querySelector('svg[role=img] title, svg[aria-label]')}; }""")
    else:
        info = page.evaluate("""(scope) => { const c = document.querySelector(scope); const roles = {}; c.querySelectorAll('[role]').forEach(e => roles[e.getAttribute('role')] = (roles[e.getAttribute('role')]||0)+1);
          const nodeSel = c.querySelector('button[data-node]') ? 'button[data-node]' : '.react-flow__node'; const nodes = [...c.querySelectorAll(nodeSel)];
          const edgeSel = c.querySelector('.react-flow__edge') ? '.react-flow__edge' : 'line[data-edge]'; const edges = [...c.querySelectorAll(edgeSel)];
          return {roles, node_count: nodes.length, nodes_with_aria_label: nodes.filter(n => n.getAttribute('aria-label')).length, nodes_with_text_name: nodes.filter(n => (n.innerText||'').trim().length).length,
            nodes_tabbable: nodes.filter(n => n.tabIndex >= 0).length, nodes_aria_pressed: nodes.filter(n => n.hasAttribute('aria-pressed')).length,
            edge_count: edges.length, edges_with_aria_label: edges.filter(e => e.getAttribute('aria-label')).length, edges_aria_hidden_container: !!c.querySelector('svg.depgraph-edges[aria-hidden=true]')}; }""", scope)
        try:
            snap = page.locator(scope).aria_snapshot()
            info["aria_snapshot_lines"] = len(snap.splitlines())
        except Exception as e:  # report, never swallow
            info["aria_snapshot_error"] = str(e)[:100]
    info["real_screen_reader"] = "NOT RUN"
    page.close()
    return info


def t_perf(browser, data):
    res = {}
    for r in RENDERERS:
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page, watch = goto(ctx, r, data=data, wait=False)
        try:
            page.wait_for_selector("body[data-ready='1']", timeout=60000)
        except Exception as e:
            res[r] = {"error": str(e)[:100]}
            ctx.close()
            continue
        page.wait_for_timeout(1500)
        m = page.evaluate("""() => { const k = window.__kw; const c = document.querySelector('[data-testid=canvas]');
          const lt = k.longtasks; const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null;
          return {data_ready_ms: Math.round(k.marks.dataReady), render_end_ms: Math.round(k.marks.renderEnd), data_to_render_ms: Math.round(k.marks.renderEnd - k.marks.dataReady), graph_complete_ms: window.__kw_complete,
            dom_total: document.querySelectorAll('*').length, dom_canvas: c ? c.querySelectorAll('*').length : null, svg_elements_canvas: c ? c.querySelectorAll('svg *').length : null,
            longtasks: lt.length, longtask_total_ms: lt.reduce((a, b) => a + b.dur, 0), longtask_max_ms: Math.max(0, ...lt.map(x => x.dur)), heap_mb: mem}; }""")
        if r == "archify":
            fr = frame_of(page)
            if fr is None:
                m["note"] = "no artifact generated for this density (validator rejected both variants): frame metrics NOT RUN"
                m["artifact"] = "NOT GENERATED"
            else:
                m["artifact"] = "generated (reduced scope)"
                m["frame"] = fr.evaluate("""async () => { const nav = performance.getEntriesByType('navigation')[0]; let lt = [];
                  await new Promise(res => { try { const o = new PerformanceObserver(l => { lt = lt.concat(l.getEntries()); }); o.observe({type: 'longtask', buffered: true}); setTimeout(res, 300); } catch (e) { res(); } });
                  return {load_event_end_ms: Math.round(nav.loadEventEnd), dom_total: document.querySelectorAll('*').length, svg_elements: document.querySelectorAll('svg *').length, longtasks: lt.length, longtask_total_ms: Math.round(lt.reduce((a, b) => a + b.duration, 0))}; }""")
        m["net"] = watch.summary()
        res[r] = m
        ctx.close()
    return res


def pass_chromium(browser):
    out = {}
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    for name, fn in (("select", t_select), ("keyboard", t_keyboard), ("edges", t_edges), ("zoom", t_zoom), ("return_nav", t_return), ("tables", t_tables), ("i18n_ar", t_i18n), ("semantics", t_semantics)):
        out[name] = {}
        for r in RENDERERS:
            try:
                out[name][r] = fn(ctx, r)
            except Exception as e:  # recorded as a result, not hidden
                out[name][r] = {"ERROR": f"{type(e).__name__}: {str(e)[:200]}"}
    ctx.close()
    out["reduced_motion"] = t_motion(browser)
    out["viewports"] = t_viewports(browser)
    out["axe"] = t_axe(browser)
    out["perf"] = {d: t_perf(browser, d) for d in ("fixture-35", "synthetic-60", "synthetic-250")}
    # network/CSP for the functional fixture pages (all three), strict host CSP, frame CSP as served
    out["network"] = {}
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    for r in RENDERERS:
        page, watch = goto(ctx, r)
        page.wait_for_timeout(1500)
        if r == "archify":
            frame_of(page).locator(f'g[data-node-id="{SEL_KEY}"]').click()
            page.wait_for_timeout(300)
        else:
            page.click(NODE_SEL[r])
        out["network"][r] = watch.summary()
        page.close()
    ctx.close()
    return out


def pass_webkit(p):
    out = {}
    try:
        b = p.webkit.launch(executable_path=WEBKIT_EXE)
    except Exception as e:
        return {"launch_error": str(e)[:400]}
    out["version"] = b.version
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    for r in RENDERERS:
        o = {}
        try:
            page, watch = goto(ctx, r)
            if r != "archify":
                page.click(NODE_SEL[r])
                o["select_inspector_node"] = insp_node(page)
            else:
                fr = frame_of(page)
                fr.locator(f'g[data-node-id="{SEL_KEY}"]').click()
                o["frame_aria_pressed"] = fr.locator(f'g[data-node-id="{SEL_KEY}"]').get_attribute("aria-pressed")
            o["console"] = watch.summary()["csp_console"], watch.summary()["console_other"]
            page.close()
            page, _ = goto(ctx, r, view="table")
            o["tables"] = page.evaluate("() => [document.querySelectorAll('[data-testid=nodes-table] tbody tr').length, document.querySelectorAll('[data-testid=edges-table] tbody tr').length]")
            page.close()
            ctx2 = b.new_context(viewport={"width": 375, "height": 800}, has_touch=True)
            page, _ = goto(ctx2, r, view="graph")
            o["overflow_375"] = page.evaluate(OVERFLOW_JS)["page_overflow"]
            page.close(); ctx2.close()
        except Exception as e:
            o["ERROR"] = f"{type(e).__name__}: {str(e)[:200]}"
        out[r] = o
    b.close()
    return out


if __name__ == "__main__":
    results = {"started": time.strftime("%Y-%m-%dT%H:%M:%S")}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)
        results["chromium_version"] = b.version
        results["chromium"] = pass_chromium(b)
        b.close()
        if WEBKIT:
            results["webkit"] = pass_webkit(p)
    OUT.write_text(json.dumps(results, indent=1), encoding="utf-8")
    print("written", OUT)
