# Produces every presentation image in ../out/. Local server on 8777 required. Cached Chromium headless shell only, no downloads.
import glob, os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'out')
BASE = os.environ.get('HM_BASE', 'http://127.0.0.1:8777/docs/design-lab/hybrid-map/')
exe = glob.glob(os.path.expanduser('~/AppData/Local/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell.exe'))[0]


def shot(b, url, name, w=1448, h=1086, full=False, rm=False, wait=1300):
    ctx = b.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce' if rm else 'no-preference')
    pg = ctx.new_page()
    pg.goto(BASE + url); pg.wait_for_selector('h1'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(wait)
    pg.screenshot(path=os.path.join(OUT, name), full_page=full)
    ctx.close()


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe)
    for c in 'abc':
        shot(b, f'concept-{c}.html', f'concept-{c}-en-1448.jpg')
        shot(b, f'concept-{c}.html?lang=ar', f'concept-{c}-ar-1448.jpg')
    # leading candidate (B) responsive + reduced motion + states
    shot(b, 'concept-b.html', 'concept-b-en-375.jpg', 375, 812, full=True)
    shot(b, 'concept-b.html', 'concept-b-en-320.jpg', 320, 800, full=True)
    shot(b, 'concept-b.html?lang=ar', 'concept-b-ar-375.jpg', 375, 812, full=True)
    shot(b, 'concept-b.html', 'concept-b-en-768.jpg', 768, 1024, full=True)
    shot(b, 'concept-b.html', 'concept-b-en-1448-reduced-motion.jpg', rm=True, wait=400)
    shot(b, 'concept-b.html?node=sentry&tab=sources', 'concept-b-en-1448-sentry-sources.jpg')
    shot(b, 'concept-b.html?view=list', 'concept-b-en-1448-list.jpg')
    # B selection motion: frames after clicking a node (stock-sync -> Port). One-shot trace; reduced motion shows none of it.
    ctx = b.new_context(viewport={'width': 1448, 'height': 1086}); pg = ctx.new_page()
    pg.goto(BASE + 'concept-b.html?node=retail-tower'); pg.wait_for_selector('h1'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(1300)
    clip = {'x': 76, 'y': 57, 'width': 1000, 'height': 880}
    pg.screenshot(path=os.path.join(OUT, 'motion-b-0.jpg'), clip=clip)
    pg.click('.kh-node[data-node="stock-sync"]')
    for i, ms in enumerate((90, 220, 330, 1100), start=1):
        pg.wait_for_timeout(ms if i == 1 else ms - (90, 220, 330, 1100)[i - 2])
        pg.screenshot(path=os.path.join(OUT, f'motion-b-{i}.jpg'), clip=clip)
    ctx.close()
    # composites built as HTML then screenshotted
    rel = '../v2/screenshots'
    html = f'''<!doctype html><meta charset="utf-8"><style>
body{{margin:0;background:#050c14;color:#e8f3f9;font:600 22px Manrope,Segoe UI,sans-serif;padding:24px;width:3000px}}
.g{{display:grid;grid-template-columns:repeat(5,560px);gap:22px}} figure{{margin:0}} img{{width:560px;display:block;border:1px solid #2de2ec55;border-radius:8px}}
figcaption{{padding:0 0 10px}} small{{display:block;font-weight:400;color:#adc2cf;font-size:15px;margin-top:3px}}</style>
<div class="g">
<figure><figcaption>V1 static prototype<small>gold on navy, document-like (screenshots/v1)</small></figcaption><img src="{rel}/v1/mission-map-v1-static-1448.jpg"></figure>
<figure><figcaption>V2 lab<small>cinematic, calm (screenshots/v2)</small></figcaption><img src="{rel}/v2/mission-map-en-owner-1448.jpg"></figure>
<figure><figcaption>A - Balanced<small>V2 composition + V1 link patterns, three readings</small></figcaption><img src="out/concept-a-en-1448.jpg"></figure>
<figure><figcaption>B - Immersive<small>orbit = kind, selection trace, horizon timeline</small></figcaption><img src="out/concept-b-en-1448.jpg"></figure>
<figure><figcaption>C - Analytical<small>layered topology, ledger, readings matrix</small></figcaption><img src="out/concept-c-en-1448.jpg"></figure>
</div>'''
    open(os.path.join(HERE, '..', 'compare.html'), 'w', encoding='utf-8').write(html)
    ctx = b.new_context(viewport={'width': 3048, 'height': 900}); pg = ctx.new_page()
    pg.goto(BASE + 'compare.html'); pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(OUT, 'compare-v1-v2-a-b-c.jpg'), full_page=True)
    ctx.close()
    strip = '''<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#050c14;color:#e8f3f9;font:600 18px Manrope,Segoe UI,sans-serif;padding:18px;width:2060px}
.g{display:grid;grid-template-columns:repeat(4,500px);gap:20px}img{width:500px;display:block;border:1px solid #2de2ec55;border-radius:8px}figcaption{padding-bottom:8px}figure{margin:0}</style><div class="g">
<figure><figcaption>0 ms: Retail Tower OS selected</figcaption><img src="out/motion-b-0.jpg"></figure>
<figure><figcaption>~90 ms after selecting stock-sync: trace starts</figcaption><img src="out/motion-b-1.jpg"></figure>
<figure><figcaption>~330 ms: trace along its four links</figcaption><img src="out/motion-b-3.jpg"></figure>
<figure><figcaption>~1.1 s: rest state (static highlight stays)</figcaption><img src="out/motion-b-4.jpg"></figure></div>'''
    open(os.path.join(HERE, '..', 'motion-b.html'), 'w', encoding='utf-8').write(strip)
    ctx = b.new_context(viewport={'width': 2100, 'height': 500}); pg = ctx.new_page()
    pg.goto(BASE + 'motion-b.html'); pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(OUT, 'motion-b-filmstrip.jpg'), full_page=True)
    ctx.close()
    b.close()
print('done')
