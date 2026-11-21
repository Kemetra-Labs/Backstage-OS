import os
"""Probe the Archify iframe under whatever CSP the second server currently sends.
Usage: python -B csp_probe.py <label> <out_json>
Records: CSP console violations (directive + count), sandbox effects inside the frame, every request the frame page makes,
and a framing test from a non-allowed ancestor origin (localhost:5190 vs the allowed 127.0.0.1:5190). No bypass_csp.
"""
import glob, json, re, sys
from playwright.sync_api import sync_playwright

LABEL, OUT = sys.argv[1], sys.argv[2]
EXE = glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-*\chrome-headless-shell-win64\chrome-headless-shell.exe"))[0]
res = {"label": LABEL}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    msgs, reqs, fails = [], [], []
    pg.on("console", lambda m: msgs.append(m.text))
    pg.on("request", lambda q: reqs.append((q.url[:100], q.resource_type)))
    pg.on("requestfailed", lambda q: fails.append(q.url[:100]))
    pg.goto("http://127.0.0.1:5190/archify.html?view=graph", wait_until="load")
    pg.wait_for_selector("body[data-ready='1']")
    pg.wait_for_timeout(2000)
    fr = [f for f in pg.frames if f != pg.main_frame][0]
    # exercise the page a little so lazy paths run (select, zoom, theme)
    fr.locator('g[data-node-id="n12"]').click()
    fr.locator('button[aria-label="Zoom in"]').click()
    pg.wait_for_timeout(500)
    viol = {}
    for m in msgs:
        mm = re.search(r"(font|image|script|style|connect|frame|media|worker|object)[a-z-]*-src|(default-src)|directive \"([a-z-]+)\"|directive: \"?([a-z-]+)", m)
        kind = "font" if m.startswith("Loading the font") else "other"
        if re.search(r"Content Security Policy|Refused to|violates", m):
            d = re.search(r"directive[: ]+\"?([a-z-]+ ?[^\"'.]*)", m)
            viol[(kind + ": " + (d.group(1).strip()[:60] if d else "?"))] = viol.get(kind + ": " + (d.group(1).strip()[:60] if d else "?"), 0) + 1
    res["csp_violations"] = viol
    res["console_non_csp"] = [m[:140] for m in msgs if not re.search(r"Content Security Policy|Refused to|violates", m)][:6]
    res["frame_requests"] = [(u, t) for u, t in reqs if "5191" in u or t in ("Fetch", "XHR", "WebSocket", "EventSource", "Ping", "Other")]
    res["failed_requests"] = fails
    res["external_requests"] = [u for u, _ in reqs if not (u.startswith("http://127.0.0.1:519") or u.startswith("data:") or u.startswith("blob:"))]
    res["sandbox"] = fr.evaluate("""() => { const t = (f) => { try { return String(f()); } catch (e) { return 'throws ' + e.name; } };
      return {origin: t(() => window.origin), cookie: t(() => document.cookie.length), localStorage: t(() => localStorage.length), sessionStorage: t(() => sessionStorage.length), parent_access: t(() => window.parent.document.title), top_nav: t(() => { window.top.location.href; return "readable"; })};
}""")
    res["frame_dom"] = fr.evaluate("() => ({elements: document.querySelectorAll('*').length, inline_scripts: document.querySelectorAll('script:not([src])').length, ext_scripts: document.querySelectorAll('script[src]').length, ext_links: [...document.querySelectorAll('[href^=\"http\"],[src^=\"http\"]')].map(e => e.tagName + ' ' + (e.getAttribute('href')||e.getAttribute('src')).slice(0, 50)).slice(0, 4)})")
    pg.close()
    # framing from a disallowed ancestor origin (localhost instead of 127.0.0.1)
    pg2 = ctx.new_page()
    m2 = []
    pg2.on("console", lambda m: m2.append(m.text[:160]))
    pg2.goto("http://localhost:5190/archify.html?view=graph", wait_until="load")
    pg2.wait_for_timeout(2500)
    frs = [f for f in pg2.frames if f != pg2.main_frame]
    body_len = None
    try:
        body_len = frs[0].evaluate("() => document.body ? document.body.innerText.length : -1") if frs else None
    except Exception as e:
        body_len = f"unreadable ({type(e).__name__})"
    res["framing_from_disallowed_origin"] = {"refused_messages": [m for m in m2 if "frame" in m.lower() and ("Refused" in m or "ancestor" in m)][:2], "frame_body_text_len": body_len}
    b.close()
json.dump(res, open(OUT, "w"), indent=1)
print(json.dumps(res, indent=1)[:3000])
