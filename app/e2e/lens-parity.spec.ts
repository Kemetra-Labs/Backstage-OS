// BACK-92 R3 (M12 to M15 of docs/planning/BACK-65/BACK-91-PARITY-A11Y.md): lab-only checks of the four lens views, moved onto the host
// routes so the V2 lab (e2e-v2) can retire without losing them. Source tests: e2e-v2/structure.spec.ts and e2e-v2/bc.spec.ts (truth
// rules, layout requests, touch targets, Arabic). One file for the four lenses so the per-lens specs stay owned by their own work.
// Synthetic demo data; persona is a display switch, not authorization.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { LANGS, PERSONAS } from './helpers';
import { openScreen } from './lens-helpers';

const LENSES = ['/map', '/sources/observatory', '/investigation/INV-DEMO-7/replay', '/agents/deck'] as const;
type Lens = (typeof LENSES)[number];

/** Each lens view the user can be on: the map has a map and a list mode; the other three lenses have one view each. */
const VIEWS: ReadonlyArray<{ readonly route: Lens; readonly mode?: 'map' | 'list' }> = [
  { route: '/map', mode: 'map' },
  { route: '/map', mode: 'list' },
  { route: '/sources/observatory' },
  { route: '/investigation/INV-DEMO-7/replay' },
  { route: '/agents/deck' },
];
const label = (v: (typeof VIEWS)[number]) => (v.mode ? `${v.route} (${v.mode})` : v.route);

/** Puts the Mission Map in the given mode (phones open on the list, wider screens on the map). */
async function setMode(page: Page, mode: 'map' | 'list' | undefined) {
  if (!mode) return;
  const stage = page.locator('[data-testid="bc-stage"]');
  if ((await stage.getAttribute('data-mode')) !== mode) await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(mode === 'list' ? 1 : 0).click();
  await expect(stage).toHaveAttribute('data-mode', mode);
}

async function openView(page: Page, v: (typeof VIEWS)[number], q: { lang: string; persona: string; width: number }) {
  const errors = await openScreen(page, v.route, q);
  await setMode(page, v.mode);
  return errors;
}

// M12, from structure.spec.ts "truth" and bc.spec.ts "truth rules": a lens never invents a percentage or a composite score, and never
// offers an approval or execution. Controls only for the verbs: an evidence row may quote an event title ("...was merged...").
for (const v of VIEWS) {
  for (const lang of LANGS) {
    test(`M12 truth ${label(v)} ${lang}: no percentage, no composite score, no executable approval, for every persona`, async ({ page }) => {
      for (const persona of PERSONAS) {
        await openView(page, v, { lang, persona, width: 1440 });
        const text = await page.locator('body').innerText();
        expect(text, persona).not.toMatch(/\d\s?[%٪]/);
        expect(text, persona).not.toMatch(/\b(trust score|overall trust|trust posture|mission health|health score|confidence:?\s*0\.\d)/i);
        // An evidence row (.kv2-ev) and a Replay story row (it carries the event orb) select a record; their names quote it.
        const controls = page.locator('button:not(.kv2-ev):not(:has(> .kv2-ev-orb))');
        await expect(page.getByRole('button', { name: /(approve|execute|deploy|merge|retry|release now|run now)/i }).and(controls), persona).toHaveCount(0);
      }
    });
  }
}

// M13, from structure.spec.ts and bc.spec.ts "layout": nothing on a lens view is fetched from another origin (no font CDN, no
// telemetry, no source API). Every request of the page is recorded, including those the helper answers for offline runs.
for (const lang of LANGS) {
  test(`M13 no foreign requests on the lens views ${lang}: every request stays on the app's origin`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    for (const v of VIEWS) {
      for (const width of [375, 1440]) await openView(page, v, { lang, persona: 'technical', width });
    }
    expect(requests.length).toBeGreaterThan(0); // the probe is wired, so an empty foreign list means something
    expect(requests.filter((u) => !u.startsWith(`${origin}/`) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  });
}

/** Visible controls smaller than 44 x 44 px (ported from e2e-v2/bc-helpers.ts smallTargets, with the host's skip link and menu). */
const smallTargets = (page: Page): Promise<string[]> =>
  page.locator('button, a[href], select, input[type="range"], input[type="search"], [role="tab"]').evaluateAll((els) =>
    els.flatMap((e) => {
      // A select or search input is operated through its labelled wrapper, which is the touch target.
      const host = (e.closest('label.kv2-select, .kv2-search') as HTMLElement | null) ?? (e as HTMLElement);
      const r = host.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || e.closest('[hidden]') || e.closest('.kv2-sr, .sr-only')) return [];
      if ((e as HTMLElement).classList.contains('skip') || (e as HTMLElement).classList.contains('kv2-skip')) return [];
      if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0) return [];
      return r.width < 43.5 || r.height < 43.5 ? [`${e.tagName}.${(e as HTMLElement).className} ${Math.round(r.width)}x${Math.round(r.height)} ${(e.textContent ?? '').trim().slice(0, 24)}`] : [];
    }),
  );

async function phone(browser: Browser, baseURL: string, touch: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: touch, isMobile: touch, baseURL });
  return { ctx, page: await ctx.newPage() };
}

// M14, from structure.spec.ts and bc.spec.ts "touch targets": at 375 px on a touch phone every visible control of a lens view, and of
// the shell around it, is at least 44 x 44. As in the lab: the map holds it with and without touch emulation (bc.spec.ts); the other
// three lenses grow their controls under (pointer: coarse), so they are held to it on a touch phone (structure.spec.ts).
for (const v of VIEWS) {
  const modes = v.route === '/map' ? [true, false] : [true];
  test(`M14 touch targets at 375px ${label(v)}: every visible control is at least 44 x 44 (touch${modes.length > 1 ? ' and no touch' : ''})`, async ({ browser, baseURL, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox has no isMobile emulation');
    for (const touch of modes) {
      const { ctx, page } = await phone(browser, baseURL!, touch);
      for (const lang of LANGS) {
        await openView(page, v, { lang, persona: 'technical', width: 375 });
        expect(await page.locator('main button, main a[href]').count(), 'the lens rendered controls').toBeGreaterThan(0);
        expect(await smallTargets(page), `touch=${touch} ${lang}`).toEqual([]);
      }
      await ctx.close();
    }
  });
}

/** Latin text outside an isolate (bdi, dir=ltr, lang=en, kbd, svg): in Arabic it would reorder the surrounding text. From bc-helpers. */
const latinOutsideIsolates = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const out: string[] = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      const text = n.nodeValue ?? '';
      const p = n.parentElement;
      if (!/[A-Za-z]/.test(text) || !p || p.closest('bdi, [dir="ltr"], .kv2-ltr, kbd, svg, script, style, noscript, [lang="en"]')) continue;
      out.push(text.trim().slice(0, 40));
    }
    return out;
  });

// M15, from structure.spec.ts "arabic" and bc.spec.ts "Arabic and right-to-left": in Arabic no Latin run sits outside a left-to-right
// isolate and no Arabic-Indic digit is used, on every lens view for every persona.
for (const v of VIEWS) {
  test(`M15 arabic ${label(v)}: no Latin run outside a left-to-right isolate, Latin digits only, for every persona`, async ({ page }) => {
    for (const persona of PERSONAS) {
      await openView(page, v, { lang: 'ar', persona, width: 1440 });
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      expect(await latinOutsideIsolates(page), persona).toEqual([]);
      expect(await page.locator('body').innerText(), persona).not.toMatch(/[٠-٩۰-۹]/);
    }
  });
}

// M15, geometry: the map is a diagram, so Arabic does not mirror it. The canvas stays left to right and every system sits where it sits
// in English, while the panels flip (the inspector moves to the inline end, the left in Arabic).
test('M15 arabic Mission Map: the canvas geometry stays left to right while the panels flip', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no first-load intro, so positions are final at once
  const read = async (lang: 'en' | 'ar') => {
    await openScreen(page, '/map', { lang, persona: 'technical', width: 1440 });
    await setMode(page, 'map');
    const canvasDir = await page.locator('[data-testid="bc-canvas"]').evaluate((e) => getComputedStyle(e).direction);
    const canvas = (await page.locator('[data-testid="bc-canvas"]').boundingBox())!;
    // The orb is the node's position on the diagram; its label card is text, so its width follows the language.
    const nodes = await page.locator('.kv2-bc-node').evaluateAll((els, x0) => Object.fromEntries(els.map((e) => {
      const r = (e.querySelector('.kv2-bc-orb') ?? e).getBoundingClientRect();
      return [e.getAttribute('data-node'), [Math.round(r.left + r.width / 2 - x0), Math.round(r.top + r.height / 2)]];
    })), canvas.x);
    const insp = (await page.getByTestId('inspector').boundingBox())!;
    const region = (await page.locator('.kv2-bc-region').boundingBox())!;
    return { canvasDir, nodes, inspLeftOfRegion: insp.x < region.x };
  };
  const en = await read('en');
  const ar = await read('ar');
  expect(Object.keys(en.nodes).length).toBeGreaterThan(5);
  expect(ar.canvasDir).toBe('ltr');
  // Same set of systems, each within 1 px of its English position: WebKit rounds sub-pixel centres differently once the page is
  // RTL, while a mirrored or reflowed canvas moves nodes by hundreds of pixels.
  expect(Object.keys(ar.nodes).sort()).toEqual(Object.keys(en.nodes).sort());
  const enNodes = en.nodes as Record<string, [number, number]>;
  const arNodes = ar.nodes as Record<string, [number, number]>;
  for (const [id, [x, y]] of Object.entries(enNodes)) {
    const [ax, ay] = arNodes[id]!;
    expect(Math.abs(ax - x), `${id} x: en ${x}, ar ${ax}`).toBeLessThanOrEqual(1);
    expect(Math.abs(ay - y), `${id} y: en ${y}, ar ${ay}`).toBeLessThanOrEqual(1);
  }
  expect(en.inspLeftOfRegion).toBe(false);
  expect(ar.inspLeftOfRegion).toBe(true);
});
