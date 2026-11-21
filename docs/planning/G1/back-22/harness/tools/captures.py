import os
"""JPEG captures for BACK-22. Usage: python -B captures.py <harness_dir> <out_dir>
1440 EN + AR, 375 EN, 250-node, selected-node, focus-visible crops per renderer, plus compare-1440.jpg (side by side)."""
import base64
import glob
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

H, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
CHROME = glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-*\chrome-headless-shell-win64\chrome-headless-shell.exe"))[0]
BASE = "http://127.0.0.1:5190"
ENV = json.loads((H / "public/data/fixture-35.envelope.json").read_text(encoding="utf-8"))
KEY = {n["id"]: f"n{i}" for i, n in enumerate(ENV["nodes"])}
SEL = KEY["src/web/orders.ts"]
NODE = {"depgraph": f'button[data-node="{SEL}"]', "reactflow": f'.react-flow__node[data-id="{SEL}"]'}
Q = 70


def shot(page, name, clip=None):
    page.screenshot(path=str(OUT / name), type="jpeg", quality=Q, clip=clip)


def open_(ctx, r, **kw):
    q = "&".join(f"{k}={v}" for k, v in kw.items())
    pg = ctx.new_page()
    pg.goto(f"{BASE}/{r}.html?{q}", wait_until="load")
    pg.wait_for_selector("body[data-ready='1']", timeout=30000)
    pg.wait_for_timeout(1800 if r == "archify" else 700)
    return pg


def frame(pg):
    return [f for f in pg.frames if f != pg.main_frame][0]


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    for r in ("depgraph", "reactflow", "archify"):
        pg = open_(ctx, r, view="graph"); shot(pg, f"1440-en-{r}.jpg"); pg.close()
        pg = open_(ctx, r, view="graph", lang="ar"); shot(pg, f"1440-ar-{r}.jpg"); pg.close()
        pg = open_(ctx, r, view="graph", data="synthetic-250"); shot(pg, f"1440-250-{r}.jpg"); pg.close()
        pg = open_(ctx, r, view="graph")
        if r == "archify":
            frame(pg).locator(f'g[data-node-id="{SEL}"]').click()
        else:
            pg.click(NODE[r])
        pg.wait_for_timeout(500); shot(pg, f"1440-selected-{r}.jpg"); pg.close()
        # focus-visible: Tab to the first node, crop around it
        pg = open_(ctx, r, view="graph")
        pg.evaluate("() => document.body.focus()")
        for _ in range(90):
            pg.keyboard.press("Tab")
            hit = pg.evaluate("""() => { let e = document.activeElement; if (e && e.tagName === 'IFRAME') return 'frame'; return e && (e.matches('button[data-node]') || e.classList.contains('react-flow__node')); }""")
            if hit == "frame":
                hit = frame(pg).evaluate("() => { const e = document.activeElement; return !!(e && e.getAttribute('data-node-id')); }")
            if hit:
                break
        pg.wait_for_timeout(300)
        box = pg.evaluate("""() => { let e = document.activeElement; let off = {x: 0, y: 0}; if (e.tagName === 'IFRAME') { const f = e.getBoundingClientRect(); off = {x: f.left, y: f.top}; }
          return {tag: e.tagName}; }""")
        if r == "archify":
            fr = frame(pg)
            rect = fr.evaluate("() => { const r = document.activeElement.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
            f = pg.locator("iframe").bounding_box()
            clip = {"x": max(0, f["x"] + rect[0] - 30), "y": max(0, f["y"] + rect[1] - 30), "width": rect[2] + 60, "height": rect[3] + 60}
        else:
            rect = pg.evaluate("() => { const r = document.activeElement.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
            clip = {"x": max(0, rect[0] - 30), "y": max(0, rect[1] - 30), "width": rect[2] + 60, "height": rect[3] + 60}
        shot(pg, f"focus-{r}.jpg", clip=clip); pg.close()
    ctx.close()
    ctx = b.new_context(viewport={"width": 375, "height": 800}, has_touch=True)
    for r in ("depgraph", "reactflow", "archify"):
        pg = open_(ctx, r, view="graph"); shot(pg, f"375-en-{r}.jpg"); pg.close()
    ctx.close()
    # side-by-side compare page (data URIs, rendered by a throwaway page, not part of the harness)
    imgs = {r: base64.b64encode((OUT / f"1440-en-{r}.jpg").read_bytes()).decode() for r in ("depgraph", "reactflow", "archify")}
    labels = {"depgraph": "DepGraph (Kawalys React/SVG copy)", "reactflow": "React Flow 13.0.2", "archify": "Archify 3.2.0 (sandboxed iframe, REDUCED scope: 18 of 38 components)"}
    html = "<body style='margin:0;background:#111;color:#eee;font:14px sans-serif'><div style='display:flex;gap:6px;width:1920px'>" + "".join(
        f"<div style='width:634px'><div style='padding:4px 6px'>{labels[r]}</div><img style='width:634px;display:block' src='data:image/jpeg;base64,{imgs[r]}'></div>" for r in imgs) + "</div></body>"
    ctx = b.new_context(viewport={"width": 1920, "height": 460})
    pg = ctx.new_page()
    pg.set_content(html)
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / "compare-1440.jpg"), type="jpeg", quality=Q)
    b.close()
tot = sum(f.stat().st_size for f in OUT.glob("*.jpg"))
print(len(list(OUT.glob("*.jpg"))), "files", round(tot / 1048576, 2), "MB")
