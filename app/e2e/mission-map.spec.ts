// BACK-87: the B+C Mission Map mounted inside the one host AppShell. One shell, one persona and language, one router (the hash);
// the map's selection lives in the host route, so deep links and Back/Forward work. Restricted evidence stays undisclosed across the
// map, the list, every inspector tab and the route. Persona is a display switch on synthetic data, not authorization.
import { expect, test, type Page } from '@playwright/test';
import { translate } from '../src/lenses/i18n/t';
import { COPY } from '../src/i18n/strings';
import { LANGS, openRoute, PERSONAS, WIDTHS } from './helpers';
import { blurRadii, clippedElements, expectRenderedAA, infiniteAnimations, smallTargets, waitForAnimationsSettled, waitForIntroDone } from './lens-fidelity';
import { expectNoLeaks, RESTRICTED_IDS, shows } from './leaks';
import { hash, openScreen } from './lens-helpers';

const LAY = ['owner', 'nontechnical'] as const;
const node = (page: Page, id: string) => page.locator(`.kv2-bc-node[data-node="${id}"]`);


test('the canonical fixture has the restricted record this spec depends on', () => {
  expect(RESTRICTED_IDS).toContain('E-5');
  expect(RESTRICTED_IDS).toContain('O-5');
});

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`Mission Map ${lang} @${width}px: one shell, one h1, no overflow, no console errors, right direction`, async ({ page }) => {
      const errors = await openRoute(page, '/map', { lang, persona: 'owner', width });
      await expect(page.locator('[data-testid="mission-map-lens"]')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      expect(await page.locator('main').count()).toBe(1);
      expect(await page.locator('#sidenav').count()).toBe(1);
      expect(await page.locator('.skip').count()).toBe(1);
      // No second application shell, and nothing of the lab's own navigation.
      expect(await page.locator('.kv2-app, .kv2-top, .kv2-side, .kv2-skip').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

// BACK-91 (axe label-content-name-mismatch, WCAG 2.5.3 Label in Name): a speech-input user says what they see, so every word a node
// shows (title, description on the selected card, status, read age) must appear in its accessible name as one unbroken run.
const words = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const containsRun = (name: string[], run: string[]): boolean =>
  run.length === 0 || name.some((_, i) => run.every((w, j) => name[i + j] === w));

for (const lang of LANGS) {
  for (const persona of ['owner', 'technical'] as const) {
    test(`Mission Map ${lang}/${persona}: every node's accessible name contains its visible text, also on the selected card`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); // no intro, so every card is at rest and visible
      await openRoute(page, '/map/retail-tower/inventory', { lang, persona });
      await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
      const ids = await page.locator('.kv2-bc-node').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.node ?? ''));
      expect(ids.length).toBe(10);
      for (const id of ids) {
        const el = node(page, id);
        // The browser's computed accessible name (aria snapshot), not an attribute, so a name computed from content is checked too.
        const name = /button "(.*)"/.exec(await el.ariaSnapshot())?.[1] ?? '';
        const n = { id, visible: await el.evaluate((e) => (e as HTMLElement).innerText), name };
        expect(words(n.visible).length, `${n.id} shows text`).toBeGreaterThan(0);
        expect(containsRun(words(n.name), words(n.visible)), `${n.id}: name "${n.name}" must contain the visible "${n.visible}"`).toBe(true);
      }
    });
  }
}

// BACK-91: on a narrow canvas unselected nodes hide their status chip, but a screen-reader user must still hear the status
// (unknown is never healthy, and stale or unavailable must not sound like healthy). The name is computed from content, so the
// chip may be visually hidden but never removed from the name.
for (const lang of LANGS) {
  test(`Mission Map ${lang} @375px: every node's accessible name still carries its status word`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openRoute(page, '/map', { lang, persona: 'owner', width: 375 });
    // Phones open on the list; switch to the map, where unselected nodes hide their chip.
    await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(0).click();
    await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'map');
    // Precondition: an unselected chip takes no visible space at this width (so the test is about a hidden status).
    expect(await page.locator('.kv2-bc-node:not([data-selected]) .kv2-chip').first().evaluate((e) => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    const ids = await page.locator('.kv2-bc-node').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.node ?? ''));
    for (const id of ids) {
      const el = node(page, id);
      const status = ((await el.locator('.kv2-chip').evaluate((e) => e.textContent ?? '')) || '').trim();
      expect(status.length, `${id} has a status word`).toBeGreaterThan(0);
      const name = /button "(.*)"/.exec(await el.ariaSnapshot())?.[1] ?? '';
      expect(name, `${id}: the name must carry "${status}"`).toContain(status);
    }
  });
}

test('Mission Map: the host navigation has the entry, marks it current, and the title names the screen', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'owner' });
  await expect(page.locator('#sidenav a[data-nav="map"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#sidenav a[data-nav="map"]')).toHaveText('Mission Map');
  await expect(page).toHaveTitle(/Mission Map/);
  await page.locator('#sidenav a[data-nav="portfolio"]').click();
  await expect(page.locator('#sidenav a[data-nav="map"]')).not.toHaveAttribute('aria-current', 'page');
  await page.locator('#sidenav a[data-nav="map"]').click();
  await expect(page.locator('[data-testid="mission-map-lens"]')).toBeVisible();
  // Navigating to a different screen moves focus to <main>, as on every other screen.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
});

test('Mission Map: the hash carries the selection only, persona and language stay in the query (one router)', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'technical', width: 1440 });
  await node(page, 'pos').click();
  expect(await hash(page)).toBe('#/map/retail-tower/pos');
  const u = new URL(page.url());
  expect(u.hash).toBe('#/map/retail-tower/pos');
  expect(Object.fromEntries(u.searchParams)).toEqual({ persona: 'technical', lang: 'en' });
});

test('Mission Map: selecting is a navigation, so Back and Forward restore the selection', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'technical', width: 1440 });
  await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');
  await node(page, 'pos').click();
  await expect(node(page, 'pos')).toHaveAttribute('aria-pressed', 'true');
  await node(page, 'jira').click();
  await expect(node(page, 'jira')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/map/retail-tower/jira');
  await page.goBack();
  await expect(node(page, 'pos')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/map/retail-tower/pos');
  await page.goBack();
  expect(await hash(page)).toBe('#/map');
  await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(node(page, 'pos')).toHaveAttribute('aria-pressed', 'true');
});

test('Mission Map: a deep link selects the node, survives a reload, a persona switch and a language switch', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/inventory', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: COPY.en.persona.technical, exact: true }).click();
  await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/map/retail-tower/inventory');
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(node(page, 'inventory')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/map/retail-tower/inventory');
});

test('Mission Map: scope changes are navigations too, and an unknown scope is not found, never guessed', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'owner', width: 1440 });
  await page.locator('.kv2-bc select').selectOption('khepri');
  expect(await hash(page)).toBe('#/map/khepri');
  await page.goBack();
  expect(await hash(page)).toBe('#/map');
  await openRoute(page, '/map/nope', { lang: 'en', persona: 'owner' });
  await expect(page.locator('h1')).toHaveText(/Page not found/);
  expect(await page.locator('[data-testid="mission-map-lens"]').count()).toBe(0);
});

test('Mission Map: an id the persona\'s world does not hold is dropped, not echoed', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/E-5', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.kv2-bc-node[aria-pressed="true"]').count()).toBe(1);
  // The dropped id is also taken out of the address, so it is not kept in the URL, the history or a copied link.
  await expect.poll(() => hash(page)).toBe('#/map/retail-tower');
  // Raw substring for the typed id, as before; every other withheld token by the probe's rules, on every surface.
  await expectNoLeaks(page, 'the dropped id', { substring: ['E-5'] });
});

test('Mission Map: the keyboard moves between nodes and Enter selects, as a navigation', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'technical', width: 1440 });
  await node(page, 'stock-sync').focus();
  await page.keyboard.press('ArrowRight');
  const moved = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-node'));
  expect(moved).toBeTruthy();
  expect(moved).not.toBe('stock-sync');
  await page.keyboard.press('Enter');
  expect(await hash(page)).toBe(`#/map/retail-tower/${moved}`);
  // Selecting is an in-screen change, so it does not move focus to <main>: the focused node is still the focused element.
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-node'))).toBe(moved);
});

test('Mission Map: on a phone the accessible list comes first, and the list view is complete', async ({ page }) => {
  await openRoute(page, '/map', { lang: 'en', persona: 'owner', width: 375 });
  await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'list');
  expect(await page.locator('.kv2-bc-ledger tr').count()).toBeGreaterThan(5);
  await page.locator('.kv2-bc-ledger button[data-node="pos"]').click();
  expect(await hash(page)).toBe('#/map/retail-tower/pos');
});

test('Mission Map: reduced motion plays no animation and no intro', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '/map', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(page.locator('[data-testid="bc-canvas"]')).not.toHaveAttribute('data-intro', /.*/);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  expect(running).toBe(0);
});

test('Mission Map: the inspector actions are host navigations, not the lab\'s screens', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/stock-sync', { lang: 'en', persona: 'technical', width: 1440 });
  await page.getByRole('button', { name: 'Open the investigation replay' }).click();
  expect(await hash(page)).toBe('#/investigation/INV-DEMO-7/replay');
  await page.goBack();
  await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');
  await openRoute(page, '/map/all/github', { lang: 'en', persona: 'technical', width: 1440 });
  await page.getByRole('button', { name: 'Open in Source Observatory' }).first().click();
  // The provider the inspector named travels with the navigation (BACK-88): the Observatory view of that source.
  expect(await hash(page)).toBe('#/sources/observatory/github');
});

test('Mission Map: a verified system links to its Project Intelligence page, an unverified one says why not', async ({ page }) => {
  await openRoute(page, '/map/retail-tower/pos', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(page.locator('[data-testid="map-open-project"]')).toHaveAttribute('href', '#/project/RT/pos');
  await page.locator('[data-testid="map-open-project"]').click();
  await expect(page.locator('main')).toHaveAttribute('data-route', 'project');
  await openRoute(page, '/map/all/github', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(page.locator('[data-testid="map-no-project"]')).toBeVisible();
  expect(await page.locator('[data-testid="map-open-project"]').count()).toBe(0);
  await openRoute(page, '/map/khepri', { lang: 'en', persona: 'owner', width: 1440 });
  await expect(page.locator('[data-testid="map-no-project"]')).toBeVisible();
  // The link describes what the map shows: with no node in the route the map falls back to stock-sync, and so does the link.
  for (const r of ['/map', '/map/all', '/map/retail-tower']) {
    await openRoute(page, r, { lang: 'en', persona: 'owner', width: 1440 });
    await expect(page.locator('[data-testid="map-open-project"]'), r).toHaveAttribute('href', '#/project/RT/stock-sync');
    await expect(node(page, 'stock-sync')).toHaveAttribute('aria-pressed', 'true');
  }
});

const ROUTES = ['/map', '/map/retail-tower/inventory', '/map/retail-tower/stock-sync', '/map/all/sentry', '/map/retail-tower/E-5'] as const;

for (const lang of LANGS) {
  for (const persona of LAY) {
    test(`Mission Map non-disclosure ${persona}/${lang}: no restricted id, record or observation on any route, view or tab`, async ({ page }) => {
      for (const route of ROUTES) {
        await openRoute(page, route, { lang, persona, width: 1440 });
        // The address holds no restricted id on any route: the probe route types one, and the page takes it back out of the address.
        for (const id of RESTRICTED_IDS) await expect.poll(() => page.url(), route).not.toContain(id);
        for (const view of ['map', 'list'] as const) {
          await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(view === 'list' ? 1 : 0).click();
          await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', view);
          const tabs = page.getByRole('tab');
          for (let i = 0; i < (await tabs.count()); i += 1) {
            await tabs.nth(i).click();
            // The address of a route the tester typed (the E-5 probe) is theirs; everything the page adds must be clean.
            for (const id of RESTRICTED_IDS) expect(page.url(), `${route} ${view} tab ${i}`).not.toContain(id);
            await expectNoLeaks(page, `${persona}/${lang} ${route} ${view} tab ${i}`);
          }
        }
      }
    });
  }
}

for (const lang of LANGS) {
  test(`Mission Map non-disclosure switch ${lang}: technical, owner, technical, owner on one page leaves nothing behind`, async ({ page }) => {
    await openRoute(page, '/map/all/sentry', { lang, persona: 'technical', width: 1440 });
    const L = COPY[lang].persona;
    await page.getByRole('tab').nth(1).click();
    expect(await shows(page, 'E-5'), 'technical sees the record').toBe(true);
    for (const p of ['owner', 'technical', 'owner', 'nontechnical'] as const) {
      await page.getByRole('button', { name: L[p], exact: true }).click();
      await page.getByRole('tab').nth(1).click();
      if (p === 'technical') expect(await shows(page, 'E-5'), p).toBe(true);
      else await expectNoLeaks(page, p);
    }
  });
}

for (const persona of PERSONAS) {
  test(`Mission Map ${persona}: no operational control that acts on anything (read-only)`, async ({ page }) => {
    await openRoute(page, '/map', { lang: 'en', persona, width: 1440 });
    await expect(page.getByRole('button', { name: /(approve|execute|deploy|merge|retry|release now|run now)/i })).toHaveCount(0);
  });
}

// ---- BACK-92 R3: lab parity (M1, M2, M4 to M8), ported from e2e-v2/fidelity.spec.ts, bc.spec.ts and nondisclosure.spec.ts so the
// lab suite can be retired without losing what it guarded. Same assertions, on the host route instead of v2.html?concept=bc.

/** Opens the map on the host route in the map view (phones open on the list) and waits for the first-load orbit to finish. */
async function openMapView(page: Page, route: string, q: { lang?: string; persona?: string; width?: number; height?: number }) {
  await openScreen(page, route, q);
  if (q.height) await page.setViewportSize({ width: q.width ?? 1280, height: q.height }); // openRoute sets 900; use the phone's own height
  if ((await page.locator('[data-testid="bc-stage"]').getAttribute('data-mode')) !== 'map') {
    await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(0).click();
    await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'map');
  }
  await waitForIntroDone(page);
}

// M1 (fidelity.spec contrast): text over the horizon and the glow keeps AA on rendered pixels, in both languages and at every width.
// Each width is measured in the view it opens on, as the lab did (the lab skipped phones, whose map opened on its list): the map
// from 768 px, the list on phones, over the same cosmos and horizon. The B+C map view on a phone is not asserted: at 320 and
// 375 px node cards overlap neighbouring orbs (BACK-92 R3 finding, see the M7 test at 320 px), so text there falls below AA.
const MAP_SIGNATURE = '.kv2-bc-region';
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`Mission Map contrast ${lang} @${width}px: text over the horizon and glow keeps AA on rendered pixels`, async ({ page, browserName }) => {
      // BACK-92 R3 finding, first WebKit run (CI run 45466047136): WebKit renders the horizon and glow so that muted text lands at
      // 3.68-3.91:1 and labels over the amber orbs at 1.09-1.81:1 (needs 4.5). Only English at 1440 px stays AA. Kept as a known
      // failure so the check still runs; when the design fix lands this turns red and the mark must go.
      test.fail(browserName === 'webkit' && !(lang === 'en' && width === 1440), 'WebKit contrast below AA on the B+C map (BACK-92 R3 finding)');
      await openScreen(page, '/map', { lang, persona: 'owner', width });
      const mode = await page.locator('[data-testid="bc-stage"]').getAttribute('data-mode');
      expect(mode).toBe(width <= 375 ? 'list' : 'map');
      await waitForIntroDone(page);
      await expectRenderedAA(page, MAP_SIGNATURE, `map (${mode} view) ${lang} ${width}`);
    });
  }
}

// M2 (fidelity.spec luminosity): truth in visuals. Glow marks the hub, the selection and observed links (hybrid-map README, "luminosity
// for a reason"); an unknown or unavailable system at rest carries none, and neither does a link that is not observed.
test('Mission Map luminosity: unknown and unavailable nodes at rest carry no glow; the selected node and observed links do', async ({ page }) => {
  await openMapView(page, '/map/all/stock-sync', { lang: 'en', persona: 'technical', width: 1440 });
  const quiet = await page.locator('.kv2-bc-node:not([data-selected]):not([data-hub])').evaluateAll((els) =>
    els.filter((e) => ['unk', 'bad'].includes(e.getAttribute('data-tone') ?? '')).map((e) => ({ id: e.getAttribute('data-node'), shadow: getComputedStyle(e.querySelector('.kv2-bc-orb')!).boxShadow })),
  );
  expect(quiet.length).toBeGreaterThan(3);
  for (const n of quiet) expect(blurRadii(n.shadow).every((b) => b === 0), `${n.id}: ${n.shadow}`).toBe(true);
  const selected = await page.locator('.kv2-bc-node[data-selected] .kv2-bc-orb').evaluate((e) => getComputedStyle(e).boxShadow);
  expect(Math.max(...blurRadii(selected))).toBeGreaterThan(20);
  // Links: the under-glow path is drawn for observed links only, and it is visible (stroke wider than the link itself).
  const edges = await page.locator('.kv2-bc-edge').evaluateAll((els) => els.map((e) => {
    const glow = e.querySelector('.kv2-bc-glow');
    const line = e.querySelector('path:not(.kv2-bc-glow)')!;
    return {
      id: (e as SVGElement).dataset.id, truth: (e as SVGElement).dataset.truth, glow: !!glow,
      glowWidth: glow ? parseFloat(getComputedStyle(glow).strokeWidth) : 0, lineWidth: parseFloat(getComputedStyle(line).strokeWidth),
      filter: [...e.querySelectorAll('path')].map((p) => getComputedStyle(p).filter).filter((f) => f !== 'none'),
    };
  }));
  const observed = edges.filter((e) => e.truth === 'observed');
  expect(observed.length).toBeGreaterThan(0);
  for (const e of observed) expect(e.glow && e.glowWidth > e.lineWidth, `${e.id} observed: glow ${e.glowWidth} over ${e.lineWidth}`).toBe(true);
  for (const e of edges.filter((x) => x.truth !== 'observed')) {
    expect(e.glow, `${e.id} (${e.truth}) must not glow`).toBe(false);
    expect(e.filter, `${e.id} (${e.truth}) filter`).toEqual([]);
  }
});

// M4 (bc.spec performance budget): about 600 DOM and 200 SVG elements on the map's own stage, no backdrop-filter, one filter at most.
test('Mission Map performance budget: the stage stays within about 600 DOM and 200 SVG elements, no backdrop-filter, one filter', async ({ page }) => {
  await openMapView(page, '/map', { lang: 'en', persona: 'owner', width: 1440 });
  const count = () => page.evaluate(() => {
    const stage = document.querySelector('.kv2-bc')!;
    const all = [...stage.querySelectorAll('*')];
    return {
      page: document.body.querySelectorAll('*').length,
      pageSvg: document.body.querySelectorAll('svg, svg *').length,
      dom: all.length,
      svg: stage.querySelectorAll('svg, svg *').length,
      backdrop: all.filter((e) => { const b = getComputedStyle(e).backdropFilter; return b && b !== 'none'; }).length,
      filters: all.filter((e) => getComputedStyle(e).filter !== 'none').length,
    };
  });
  const map = await count();
  await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(1).click();
  await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'list');
  const list = await count();
  // The host shell (top bar, navigation) is measured and reported, not budgeted: the budget is for the map's own stage.
  test.info().annotations.push({ type: 'bc-budget', description: `map stage dom=${map.dom} svg=${map.svg} | whole page dom=${map.page} svg=${map.pageSvg} | list stage dom=${list.dom} svg=${list.svg}` });
  expect(map.dom).toBeLessThanOrEqual(600);
  expect(map.svg).toBeLessThanOrEqual(210);
  expect(map.backdrop).toBe(0);
  expect(map.filters).toBeLessThanOrEqual(1);
});

// M5 (bc.spec first-load orbit): it plays once, animates only opacity, translate and stroke-dashoffset, never more than 10 animations
// at once (hybrid-map ENHANCEMENT-NOTE budget), and does not replay within the page session (view switch, or selecting a system).
interface IntroRecord { readonly seen: boolean; readonly max: number; readonly peak: string; readonly props: string[]; readonly timedOut: boolean }

/** Opens the map with a per-frame probe of every animation in its active phase, and resolves once the first-load orbit is over. */
async function recordIntro(page: Page): Promise<IntroRecord> {
  await page.addInitScript(() => {
    const w = window as unknown as { __intro: IntroRecord & { done: boolean } };
    const r = { seen: false, max: 0, peak: '', props: [] as string[], done: false, timedOut: false };
    w.__intro = r;
    const tick = () => {
      if (document.querySelector('.kv2-bc-canvas[data-intro]')) r.seen = true;
      // Active phase = a running animation whose computed progress is not null (null before its delay and after its end). The lab
      // read getComputedTiming().phase, which Chromium does not expose, so its filter matched nothing and its check was vacuous.
      const active = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().progress != null);
      if (active.length > r.max) {
        r.max = active.length;
        const by: Record<string, number> = {};
        for (const a of active) { const n = (a as CSSAnimation).animationName ?? '(script)'; by[n] = (by[n] ?? 0) + 1; }
        r.peak = JSON.stringify(by);
      }
      for (const a of active) for (const kf of (a.effect as KeyframeEffect).getKeyframes()) for (const k of Object.keys(kf)) if (!r.props.includes(k)) r.props.push(k);
      const idle = r.seen && !document.querySelector('.kv2-bc-canvas[data-intro]') && !document.getAnimations().some((a) => a.playState === 'running');
      if (idle) r.done = true;
      else if (performance.now() >= 10_000) { r.timedOut = true; r.done = true; }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await openScreen(page, '/map', { lang: 'en', persona: 'owner', width: 1440 });
  await page.waitForFunction(() => (window as unknown as { __intro: { done: boolean } }).__intro.done, null, { timeout: 12_000 });
  const r = await page.evaluate(() => (window as unknown as { __intro: IntroRecord }).__intro);
  test.info().annotations.push({ type: 'intro', description: `peak ${r.max} animations at once ${r.peak}; properties ${r.props.join(', ')}` });
  expect(r.timedOut).toBe(false);
  expect(r.seen).toBe(true);
  // The probe must have seen the orbit move, or the checks on what it saw would pass on nothing.
  expect(r.max).toBeGreaterThan(0);
  expect(r.props).toEqual(expect.arrayContaining(['opacity', 'translate', 'strokeDashoffset']));
  return r;
}

test('Mission Map first-load orbit: plays once, animates only opacity, translate and stroke-dashoffset, never replays', async ({ page }) => {
  const r = await recordIntro(page);
  for (const p of r.props) expect(['offset', 'easing', 'composite', 'computedOffset', 'strokeDashoffset', 'opacity', 'translate']).toContain(p);
  await expect(page.locator('.kv2-bc-canvas[data-intro]')).toHaveCount(0);
  await expect(page.locator('.kv2-bc-draw')).toHaveCount(0);
  // From here on, any data-intro or orbit draw that appears even for one frame is a replay. A retrying toHaveCount(0) alone (as in
  // the lab) would wait out a 1.3 s replay and pass, so a MutationObserver records it instead.
  await page.evaluate(() => {
    const w = window as unknown as { __replayed: string[] };
    w.__replayed = [];
    const check = () => {
      if (document.querySelector('[data-intro]')) w.__replayed.push('data-intro');
      if (document.querySelector('.kv2-bc-draw')) w.__replayed.push('kv2-bc-draw');
    };
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-intro', 'class'] });
  });
  const seg = page.locator('.kv2-bc-top .kv2-seg').last().locator('button');
  await seg.nth(1).click();
  await seg.nth(0).click();
  await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'map');
  await node(page, 'pos').click(); // a host navigation: the lens renders a new route, and still does not replay
  await expect(node(page, 'pos')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1500); // longer than the 1.3 s intro window, so a late replay is seen too
  expect(await page.evaluate(() => (window as unknown as { __replayed: string[] }).__replayed)).toEqual([]);
  await expect(page.locator('.kv2-bc-canvas[data-intro]')).toHaveCount(0);
  await expect(page.locator('.kv2-bc-draw')).toHaveCount(0);
});

test('Mission Map first-load orbit: never more than 10 animations at once', async ({ page }) => {
  // Known defect, found by this port (BACK-92 R3): measured in its active phase, the first load peaks at 18 animations at once
  // (3 orbit draws, 10 node settles, 5 selection traces for the default stock-sync selection); the intro alone peaks at 13. The
  // lab's version of this check never counted anything (see recordIntro), so it passed; the lab renders the same MissionMapBC with
  // the same default selection. Marked expected to fail, with the budget unchanged, so the run turns red once the budget is met.
  test.fail(true, 'B+C first load peaks at 18 animations at once, over the budget of 10 (BACK-92 R3 finding)');
  const r = await recordIntro(page);
  expect(r.max, r.peak).toBeLessThanOrEqual(10);
});


// M6 (bc.spec idle animation): once the intro is over, nothing loops, the decorative background included.
test('Mission Map: the idle page runs no infinite animation, including the decorative background', async ({ page }) => {
  await openScreen(page, '/map', { lang: 'en', persona: 'owner', width: 1440 });
  // Wait for the intro to drop, not for every animation to settle: a loop never settles, and the assertion should name it.
  await expect(page.locator('.kv2-bc-canvas[data-intro]')).toHaveCount(0, { timeout: 10_000 });
  expect(await infiniteAnimations(page)).toEqual([]);
  await waitForAnimationsSettled(page);
  expect(await infiniteAnimations(page)).toEqual([]);
});

// M7 (bc.spec phone map legibility, BACK-34): on a phone the canvas aspect ratio changes while the SVG stretches, so the cues that must
// keep their shape are HTML markers and non-scaling strokes.
for (const [width, height] of [[320, 700], [375, 812], [768, 1024]] as const) {
  test(`Mission Map at ${width}px: link markers are round, on their link, counted from the DOM; strokes do not scale; orbs do not overlap`, async ({ page }) => {
    // Known host defect, found by this port (BACK-92 R3): at 320 px the host's gutters leave the canvas 264 px wide (the lab's is
    // wider) and the Retail Tower hub orb overlaps the Khepri orb by about 8 x 34 px. The lab passes at 320 px. Marked expected to
    // fail, with the assertion unchanged, so the run turns red the moment the layout is fixed and this mark must be removed.
    test.fail(width === 320, 'host defect: hub and Khepri orbs overlap on a 320 px phone (BACK-92 R3 finding)');
    await openMapView(page, '/map', { lang: 'en', persona: 'owner', width, height });

    // markers are HTML siblings of the node buttons, not SVG shapes
    await expect(page.locator('.kv2-bc-svg .kv2-bc-mk')).toHaveCount(0);
    const expected = await page.locator('.kv2-bc-edge').evaluateAll((els) => els.filter((e) => {
      const d = (e as SVGElement).dataset;
      return d.truth !== 'unknown' && d.cls !== 'group'; // observed, correlated and hypothesis links carry a marker
    }).length);
    expect(expected).toBeGreaterThan(0);
    await expect(page.locator('.kv2-bc-canvas > .kv2-bc-mk')).toHaveCount(expected);

    const marks = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.kv2-bc-mk')].map((m) => {
      const r = m.getBoundingClientRect();
      const path = document.querySelector<SVGPathElement>(`.kv2-bc-edge[data-id="${m.dataset.edge}"] path:not(.kv2-bc-glow)`)!;
      const p = path.getPointAtLength(path.getTotalLength() / 2);
      const q = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
      return { edge: m.dataset.edge, w: r.width, h: r.height, off: Math.hypot(r.left + r.width / 2 - q.x, r.top + r.height / 2 - q.y) };
    }));
    expect(marks).toHaveLength(expected);
    for (const m of marks) {
      expect(m.w, `${m.edge} width`).toBeGreaterThanOrEqual(10);
      expect(m.h, `${m.edge} height`).toBeGreaterThanOrEqual(10);
      expect(Math.abs(m.w - m.h), `${m.edge} stretched`).toBeLessThanOrEqual(1);
      expect(m.off, `${m.edge} off its link`).toBeLessThanOrEqual(3);
    }

    const effects = await page.evaluate(() => [...document.querySelectorAll('.kv2-bc-edge path, .kv2-bc-orbit')].map((e) => getComputedStyle(e).vectorEffect));
    expect(effects.length).toBeGreaterThan(0);
    expect([...new Set(effects)]).toEqual(['non-scaling-stroke']);

    const orbs = await page.locator('.kv2-bc-orb').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, n: (e.closest('[data-node]') as HTMLElement).dataset.node }; }));
    expect(orbs).toHaveLength(10);
    for (let i = 0; i < orbs.length; i++) {
      for (let j = i + 1; j < orbs.length; j++) {
        const a = orbs[i]!; const b = orbs[j]!;
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        expect(ox > 4 && oy > 4, `orbs ${a.n} and ${b.n} overlap by ${Math.round(ox)} x ${Math.round(oy)}`).toBe(false);
      }
    }

    // Touch targets of the B+C stage, the part the lab measured (its own shell retires with it). The host shell and the host's
    // "Open this system in Project Intelligence" text link under the stage are the host's own controls: M14 (touch targets on the
    // lens views) covers them.
    if (width <= 640) expect(await smallTargets(page, '[data-testid="bc-stage"]')).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await clippedElements(page)).toEqual([]);
  });
}

test('Mission Map markers keep their shape and colour state: dim follows the edge, and they stay left-to-right in Arabic', async ({ page }) => {
  await openMapView(page, '/map/retail-tower/stock-sync', { lang: 'ar', persona: 'owner', width: 375, height: 812 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const dimEdges = await page.locator('.kv2-bc-edge[data-dim]').evaluateAll((els) => els.map((e) => (e as SVGElement).dataset.id).sort());
  const dimMarks = await page.locator('.kv2-bc-mk[data-dim]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.edge).sort());
  const withMark = await page.locator('.kv2-bc-mk').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.edge));
  expect(dimEdges.length).toBeGreaterThan(0);
  expect(dimMarks).toEqual(dimEdges.filter((id) => withMark.includes(id)));
  expect(await page.locator('.kv2-bc-mk').evaluateAll((els) => els.map((e) => getComputedStyle(e).direction))).toEqual(withMark.map(() => 'ltr'));
  await expect(page.locator('.kv2-bc-mk[data-shape="diamond"]')).not.toHaveCount(0);
  await expect(page.locator('.kv2-bc-mk[data-shape="circle"]')).not.toHaveCount(0);
});

test('Mission Map reduced motion at 375px: markers are present and nothing animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openScreen(page, '/map', { lang: 'en', persona: 'owner', width: 375 });
  await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(0).click();
  await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'map');
  await expect(page.locator('.kv2-bc-mk').first()).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

// M8 (bc.spec / nondisclosure.spec d4): the stale Inventory-Sentry link (d4) rests on Technical-only evidence. Technical sees it drawn
// and flagged stale in the list; Owner and Non-technical get neither the link nor a "restricted" note; switching persona drops it at
// once. Display persona on synthetic data, not authorization.
const restrictedNote = (lang: 'en' | 'ar') => translate('edge.restricted', lang, 'owner');

for (const lang of LANGS) {
  test(`Mission Map d4 ${lang}: Technical sees the stale-backed Inventory-Sentry link drawn and flagged; Owner gets neither the link nor a note`, async ({ page }) => {
    await openMapView(page, '/map/retail-tower/inventory', { lang, persona: 'technical', width: 1440 });
    await expect(page.locator('.kv2-bc-edge[data-id="d4"]')).toHaveCount(1);
    await expect(page.locator('.kv2-bc-edge[data-id="d4"][data-stale]')).toHaveCount(1);
    await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(1).click();
    await expect(page.locator('.kv2-bc-links tr[data-link="d4"] [data-stale-chip]')).toHaveCount(1);

    for (const persona of LAY) {
      await openMapView(page, '/map/retail-tower/inventory', { lang, persona, width: 1440 });
      await expect(page.locator('.kv2-bc-edge').first()).toBeAttached();
      await expect(page.locator('.kv2-bc-edge[data-id="d4"]')).toHaveCount(0);
      await expect(page.locator('.kv2-bc-mk[data-edge="d4"]')).toHaveCount(0);
      await expect(page.getByText(restrictedNote(lang))).toHaveCount(0);
      await page.locator('.kv2-bc-top .kv2-seg').last().locator('button').nth(1).click();
      await expect(page.locator('[data-testid="bc-stage"]')).toHaveAttribute('data-mode', 'list');
      await expect(page.locator('.kv2-bc-links tr[data-link]').first()).toBeVisible();
      await expect(page.locator('.kv2-bc-links tr[data-link="d4"]')).toHaveCount(0);
      await expect(page.locator('.kv2-bc-links [data-stale-chip]')).toHaveCount(0);
      await expect(page.getByText(restrictedNote(lang))).toHaveCount(0);
    }
  });
}

test('Mission Map d4: switching the display persona from Technical to Owner drops the link at once (display only, not authorization)', async ({ page }) => {
  await openMapView(page, '/map/retail-tower/inventory', { lang: 'en', persona: 'technical', width: 1440 });
  await expect(page.locator('.kv2-bc-edge[data-id="d4"]')).toHaveCount(1);
  await page.locator('#bcinsp-tab-evidence').click();
  await expect(page.locator('#bcinsp-panel')).toContainText('E-5');
  await page.getByRole('button', { name: COPY.en.persona.owner, exact: true }).click();
  // "At once": no reload and no navigation away; the same page no longer draws it.
  await expect(page.locator('.kv2-bc-edge[data-id="d4"]')).toHaveCount(0);
  await expect(page.locator('.kv2-bc-mk[data-edge="d4"]')).toHaveCount(0);
  await expect(page.getByText(restrictedNote('en'))).toHaveCount(0);
  await expectNoLeaks(page, 'after the switch to Owner');
  await page.getByRole('button', { name: COPY.en.persona.technical, exact: true }).click();
  await expect(page.locator('.kv2-bc-edge[data-id="d4"]')).toHaveCount(1);
});
