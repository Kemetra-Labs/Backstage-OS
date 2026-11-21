# Usage: python -I overflow.py <url> <width>  -> lists elements whose right edge exceeds the viewport (ASCII)
import sys, glob, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('HM_BASE', 'http://127.0.0.1:8777/docs/design-lab/hybrid-map/')
exe = glob.glob(os.path.expanduser('~/AppData/Local/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell.exe'))[0]
url, w = sys.argv[1], int(sys.argv[2])
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe)
    pg = b.new_context(viewport={'width': w, 'height': 800}).new_page()
    pg.goto(BASE + url); pg.wait_for_selector('h1'); pg.wait_for_timeout(500)
    res = pg.evaluate("""(w)=>{const out=[];document.querySelectorAll('body *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>w+1){let p=e,scroller=false;while(p=p.parentElement){const o=getComputedStyle(p).overflowX;if(o==='auto'||o==='scroll'||o==='hidden'){scroller=true;break}}if(!scroller)out.push((e.className&&e.className.baseVal===undefined?e.className:e.tagName)+' '+Math.round(r.right))}});return out.slice(0,12)}""", w)
    print(res)
    b.close()
