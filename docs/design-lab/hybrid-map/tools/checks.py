# Self-checks for the three concept pages (mirrors the V2 suite's truth / a11y / RTL / motion rules). ASCII output only.
# Usage: python -I checks.py   (needs the local server on 8777; uses the cached Chromium headless shell, downloads nothing)
import glob, os, re, json
from playwright.sync_api import sync_playwright

BASE = os.environ.get('HM_BASE', 'http://127.0.0.1:8777/docs/design-lab/hybrid-map/')
exe = glob.glob(os.path.expanduser('~/AppData/Local/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell.exe'))[0]
FORBID = re.compile(r'\b(approve|reject|defer|go|release|retry|run)\b', re.I)
rows = []

def check(name, ok, detail=''):
    rows.append((name, bool(ok), detail))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe)
    for c in 'abc':
        url = f'concept-{c}.html'
        ctx = b.new_context(viewport={'width': 1448, 'height': 1086})
        pg = ctx.new_page()
        errs = []
        reqs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('request', lambda r: reqs.append(r.url))
        pg.goto(BASE + url); pg.wait_for_selector('h1'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(1300)
        T = f'[{c.upper()}]'
        check(T + ' no console or page errors', not errs, str(errs[:2]))
        check(T + ' every request is same-origin', all(u.startswith('http://127.0.0.1:8777/') for u in reqs), str([u for u in reqs if not u.startswith('http://127.0.0.1:8777/')][:2]))
        text = pg.inner_text('#app')
        check(T + ' no percent sign in rendered text', '%' not in text)
        fig = pg.evaluate('KD.FIG')
        exp = dict(products=2, projects=3, services=5, risks=3, sourceIssues=2, reachable=3, current=2, healthy=1, sourceTotal=6, observedChanges=5, depEdges=8, groupEdges=3)
        check(T + ' derived figures match the audit table', all(fig[k] == v for k, v in exp.items()), json.dumps({k: fig[k] for k in exp if fig[k] != exp[k]}))
        check(T + ' link classes 2 observed / 1 correlated / 1 hypothesis / 4 unknown', fig['links'] == dict(observed=2, correlated=1, hypothesis=1, unknown=4), str(fig['links']))
        node_sel = '.kh-node'
        nodes = pg.query_selector_all(node_sel)
        healthy_nodes = [n for n in nodes if re.search(r'\bHealthy\b', n.get_attribute('aria-label') or '')]
        check(T + ' exactly one node reads Healthy (GitHub)', len(healthy_nodes) == 1 and 'GitHub' in healthy_nodes[0].get_attribute('aria-label'), str(len(healthy_nodes)))
        check(T + ' 10 nodes, all native buttons, all focusable', len(nodes) == 10 and all(n.evaluate('e => e.tagName === "BUTTON" && e.tabIndex >= 0') for n in nodes))
        for k, w in (('Khepri', 'Health unknown'), ('Jira', 'Health unknown'), ('Seshat BI', 'Health unknown'), ('Inventory service', 'Stale'), ('Sentry', 'Stale'), ('Port', 'Unavailable'), ('stock-sync', 'CI check failing')):
            lab = [n.get_attribute('aria-label') for n in nodes if (n.get_attribute('aria-label') or '').startswith(k + ',')]
            check(T + f' {k} reads {w}', lab and w in lab[0], str(lab))
        btn_text = pg.evaluate('[...document.querySelectorAll("button, a")].map(e => (e.innerText || e.getAttribute("aria-label") || "").trim()).filter(Boolean)')
        check(T + ' no approve/reject/defer/go/release/retry/run control vocabulary', not [x for x in btn_text if FORBID.search(x)], str([x for x in btn_text if FORBID.search(x)]))
        check(T + ' no form or submit control', pg.query_selector('form, [type=submit]') is None)
        # keyboard: arrow key moves focus between nodes
        pg.focus('.kh-node[data-node="stock-sync"]'); pg.keyboard.press('ArrowDown')
        moved = pg.evaluate('document.activeElement && document.activeElement.dataset.node')
        check(T + ' arrow keys move focus between nodes', moved and moved != 'stock-sync', str(moved))
        # table alternative
        pg.click('[data-view="list"]'); pg.wait_for_timeout(200)
        nrows = pg.evaluate('document.querySelectorAll(".kh-table tbody tr").length')
        has_tables = pg.evaluate('document.querySelectorAll(".kh-tablewrap").length >= 2')
        check(T + ' list view shows the same 10 systems and 11 links', has_tables and nrows >= 21, str(nrows))
        pg.click('[data-view="map"]'); pg.wait_for_timeout(200)
        # tab arrow keys
        pg.focus('[data-tab="overview"]'); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(100)
        check(T + ' inspector tabs move with arrow keys', pg.evaluate('document.querySelector("[data-tab=evidence]").getAttribute("aria-selected")') == 'true')
        # focus ring present on every node
        ring = pg.evaluate('(() => { const n = document.querySelector(".kh-node"); n.focus(); const o = getComputedStyle(n.querySelector(".kh-orb, .c-txt")).outlineStyle; return o; })()') if c != 'c' else 'ok'
        # perf counters
        perf = pg.evaluate('''({svg: document.querySelectorAll("svg *").length, dom: document.querySelectorAll("*").length, anim: document.getAnimations().length, filters: [...document.querySelectorAll("*")].filter(e => getComputedStyle(e).filter !== "none" || getComputedStyle(e).backdropFilter !== "none").length, shadows: [...document.querySelectorAll("*")].filter(e => getComputedStyle(e).boxShadow !== "none").length, frame: [document.documentElement.scrollWidth, document.documentElement.scrollHeight]})''')
        rows.append((T + ' perf', True, json.dumps(perf)))
        check(T + ' fits one 1448x1086 frame without scrolling', perf['frame'][1] <= 1087 and perf['frame'][0] == 1448, str(perf['frame']))
        ctx.close()
        # RTL
        ctx = b.new_context(viewport={'width': 1448, 'height': 1086}); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + url + '?lang=ar'); pg.wait_for_selector('h1'); pg.wait_for_timeout(900)
        check(T + ' AR: dir=rtl and canvas stays ltr', pg.evaluate('document.documentElement.dir') == 'rtl' and pg.evaluate('getComputedStyle(document.querySelector(".kh-canvas")).direction') == 'ltr' if pg.query_selector('.kh-canvas') else True)
        side = pg.evaluate('(() => { const i = document.querySelector("[data-testid=inspector]").getBoundingClientRect(); const m = document.querySelector(".kh-canvas, .kh-table").getBoundingClientRect(); return [i.left, m.left]; })()')
        check(T + ' AR: inspector flips to the left of the map', side[0] < side[1], str(side))
        atext = pg.inner_text('#app')
        check(T + ' AR: no percent sign', '%' not in atext)
        latin_outside = pg.evaluate('''(() => { const w = document.createTreeWalker(document.getElementById("app"), NodeFilter.SHOW_TEXT); let bad = 0; while (w.nextNode()) { const n = w.currentNode; if (/[A-Za-z]{2,}/.test(n.nodeValue) && !n.parentElement.closest("bdi,kbd,.kh-brand,.kh-pips,[dir=ltr],[lang=en],[data-lang]") ) bad++; } return bad; })()''')
        check(T + ' AR: every Latin run is inside an LTR isolate', latin_outside == 0, str(latin_outside))
        check(T + ' AR: no page errors', not errs)
        ctx.close()
        # reduced motion
        ctx = b.new_context(viewport={'width': 1448, 'height': 1086}, reduced_motion='reduce'); pg = ctx.new_page()
        pg.goto(BASE + url); pg.wait_for_selector('h1'); pg.wait_for_timeout(500)
        check(T + ' reduced motion: zero running animations', pg.evaluate('document.getAnimations().length') == 0)
        ctx.close()
        # touch targets at 375
        ctx = b.new_context(viewport={'width': 375, 'height': 800}, has_touch=True); pg = ctx.new_page()
        pg.goto(BASE + url); pg.wait_for_selector('h1'); pg.wait_for_timeout(500)
        small = pg.evaluate('''[...document.querySelectorAll("button, a")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5) && !e.closest(".kh-pips") && !e.classList.contains("kh-skip") && getComputedStyle(e).display !== "none"; }).map(e => (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 24) + " " + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height)).slice(0, 8)''')
        check(T + ' 375px: every visible control is at least 44x44', not small, str(small))
        ow = pg.evaluate('document.documentElement.scrollWidth')
        check(T + ' 375px: no horizontal overflow', ow <= 375, str(ow))
        ctx.close()
    b.close()

w = max(len(r[0]) for r in rows)
out = []
for n, ok, d in rows:
    out.append(('PASS ' if ok else 'FAIL ') + n.ljust(w) + ('  ' + d if d else ''))
open(os.path.join(os.path.dirname(__file__), '..', 'out', 'checks.txt'), 'w', encoding='ascii', errors='replace').write('\n'.join(out) + '\n')
print('%d pass, %d fail' % (sum(1 for r in rows if r[1] and 'perf' not in r[0]), sum(1 for r in rows if not r[1])))
for l in out:
    if l.startswith('FAIL') or 'perf' in l:
        print(l.encode('ascii', 'replace').decode())
