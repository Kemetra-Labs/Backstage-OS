# Usage: python -I shot.py <url-path-with-query> <out.png> [width] [height] [--full] [--rm] [--click sel]
# Screenshots a page of the local pilot server with the cached Chromium headless shell (no download). Logs to stdout as ASCII.
import sys, glob, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('HM_BASE', 'http://127.0.0.1:8777/docs/design-lab/hybrid-map/')
exe = glob.glob(os.path.expanduser('~/AppData/Local/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell.exe'))[0]
a = sys.argv[1:]
url, out = a[0], a[1]
w = int(a[2]) if len(a) > 2 and a[2].isdigit() else 1448
h = int(a[3]) if len(a) > 3 and a[3].isdigit() else 1086
full = '--full' in a
rm = '--rm' in a
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe)
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, reduced_motion='reduce' if rm else 'no-preference')
    pg = ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('requestfailed', lambda r: errs.append('FAILED ' + r.url))
    pg.goto(BASE + url)
    pg.wait_for_selector('h1')
    pg.evaluate('document.fonts.ready')
    pg.wait_for_timeout(1300)
    pg.screenshot(path=out, full_page=full)
    dim = pg.evaluate('({sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, cw: document.documentElement.clientWidth})')
    print('OK', out, dim, 'errors:', errs[:5])
    b.close()
