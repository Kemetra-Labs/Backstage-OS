# Usage: python -I measure.py <url> <selector,selector,...> [width] [height]  -> prints bounding box height per selector (ASCII)
import sys, glob, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('HM_BASE', 'http://127.0.0.1:8777/docs/design-lab/hybrid-map/')
exe = glob.glob(os.path.expanduser('~/AppData/Local/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell.exe'))[0]
url, sels = sys.argv[1], sys.argv[2].split(',')
w = int(sys.argv[3]) if len(sys.argv) > 3 else 1448
h = int(sys.argv[4]) if len(sys.argv) > 4 else 1086
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe)
    pg = b.new_context(viewport={'width': w, 'height': h}).new_page()
    pg.goto(BASE + url); pg.wait_for_selector('h1'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(300)
    for s in sels:
        r = pg.evaluate("(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return [Math.round(r.top+scrollY),Math.round(r.height),Math.round(r.width)]}", s)
        print(s, r)
    b.close()
