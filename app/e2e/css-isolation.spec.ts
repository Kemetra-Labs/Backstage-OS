// BACK-86 (S4): the B+C map's stylesheets cannot restyle a V1 screen. Every V1 route is measured (computed style and box of every
// element, plus the keyboard focus ring), then the whole embeddable B+C stylesheet set is injected into the page, then it is measured
// again: the two must be identical, in Chromium and WebKit, in English and Arabic. A control proves the measurement can see a leak,
// and a second control proves the injected sheets do style an element inside .kv2-scope. Synthetic demo UI only.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { LANGS, openRoute } from './helpers';
import { openScreen } from './lens-helpers';

const V2 = new URL('../src/lenses/styles/', import.meta.url);
const EMBED = ['tokens', 'base', 'scope', 'embed-fonts', 'map', 'bc', 'observatory', 'replay', 'deck'];
// url() would resolve against the page; the fonts themselves are covered by the static test (own family names only).
// The semantic roles are part of the set too: the V1 bundle does not carry them yet (BACK-87 imports them), so the page gets them here.
const SEMANTIC = new URL('../src/styles/semantic.css', import.meta.url);
const EMBED_CSS = [...EMBED.map((n) => new URL(`${n}.css`, V2)), SEMANTIC]
  .map((u) => readFileSync(u, 'utf8').replace(/url\([^)]*\)/g, 'url(data:,)')).join('\n');

const ROUTES = ['/', '/portfolio', '/project/RT', '/project/RT/stock-sync', '/investigation/INV-DEMO-7', '/evidence/E-1', '/decisions', '/agents', '/sources'];
const PROPS = [
  'display', 'position', 'boxSizing', 'color', 'backgroundColor', 'backgroundImage', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
  'letterSpacing', 'textTransform', 'textDecorationLine', 'textWrap', 'fontVariantNumeric', 'listStyleType', 'cursor', 'opacity',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderTopColor', 'borderRadius', 'overflowX', 'animationName', 'transitionProperty', 'scrollBehavior', 'direction',
] as const;

/** Computed style and box of every element under <body>, and the focus ring after one Tab, as a single comparable string. */
async function measure(page: Page): Promise<string> {
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
  // Every element is measured with nothing focused. Then, after a key press (so :focus-visible applies to a scripted focus), the
  // first button is focused and its ring measured, then blurred: the same steps every time, whatever the browser's Tab start point.
  const unfocused = await page.evaluate((props) => {
    const sig = (el: Element): string => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return `${el.tagName}.${el.className && typeof el.className === 'string' ? el.className : ''}|${props.map((p) => cs.getPropertyValue(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))).join(',')}|${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    const all = [document.documentElement, document.body, ...document.body.querySelectorAll('*')].map(sig);
    return `${all.length}\n${all.join('\n')}`;
  }, PROPS as readonly string[]);
  await page.keyboard.press('Shift');
  const ring = await page.evaluate(() => {
    const f = document.querySelector<HTMLElement>('button, a[href]');
    if (!f) return 'none';
    f.focus();
    const cs = getComputedStyle(f);
    const out = `${f.tagName}:${cs.outlineStyle},${cs.outlineWidth},${cs.outlineColor},${cs.outlineOffset},${cs.borderRadius}`;
    f.blur();
    return out;
  });
  return `${unfocused}\nFOCUS ${ring}`;
}

for (const lang of LANGS) {
  for (const route of ROUTES) {
    test(`B+C stylesheets injected: V1 ${route} is unchanged (${lang})`, async ({ page }) => {
      await openRoute(page, route, { lang, persona: 'technical' });
      // The app sets <html dir> in an effect after the first paint; measuring before it lands compares two languages.
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      const before = await measure(page);
      await page.addStyleTag({ content: EMBED_CSS });
      const after = await measure(page);
      const a = before.split('\n');
      const b = after.split('\n');
      const diff = a.map((line, i) => (line === b[i] ? null : `- ${line} => + ${b[i]}`)).filter(Boolean).slice(0, 5);
      expect(diff, 'V1 elements that changed once the B+C stylesheets were present (first five)').toEqual([]);
    });
  }
}

test('control: the measurement does see a leak (an unscoped button rule changes it)', async ({ page }) => {
  await openRoute(page, '/sources', { lang: 'en', persona: 'technical' });
  const before = await measure(page);
  await page.addStyleTag({ content: 'button { color: rgb(255, 0, 0); } :focus-visible { outline: 3px dashed rgb(255, 0, 0); }' });
  expect(await measure(page)).not.toBe(before);
});

test('control: inside .kv2-scope the injected sheets apply, with the map\'s own roles and fonts, and outside it V1 keeps its own', async ({ page }) => {
  await openRoute(page, '/sources', { lang: 'en', persona: 'technical' });
  await page.addStyleTag({ content: EMBED_CSS });
  const r = await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'kv2-scope';
    host.innerHTML = '<h2 id="kv2-h">Heading</h2><button id="kv2-b" type="button">Button</button>';
    document.body.appendChild(host);
    const role = (el: Element) => getComputedStyle(el).getPropertyValue('--sem-focus').trim().toLowerCase();
    const inside = document.getElementById('kv2-b')!;
    const outside = document.querySelector('main')!;
    return {
      insideFocus: role(inside), outsideFocus: role(outside),
      font: getComputedStyle(inside).fontFamily, h2Margin: getComputedStyle(document.getElementById('kv2-h')!).marginTop,
      boxSizing: getComputedStyle(host).boxSizing,
    };
  });
  expect(r.insideFocus).toBe('#2de2ec');
  expect(r.outsideFocus).toBe('#ddaa57');
  expect(r.font).toContain('Kawalys BC Manrope');
  expect(r.h2Margin).toBe('0px');
  expect(r.boxSizing).toBe('border-box');
});

// BACK-92 R4: the lab's global reset.css retired with the lab entry. scope.css holds the same declarations under .kv2-scope, so the
// control strips that scoping (what the lab's reset was) and shows that, unscoped, the same rules would restyle V1.
const UNSCOPED_RESET = readFileSync(new URL('scope.css', V2), 'utf8')
  .replace(/:where\(\.kv2-scope\)\s*:where\(([^)]*)\)/g, '$1')
  .replace(/:where\(\.kv2-scope\)\s*/g, '')
  .replace(/\.kv2-scope\s*/g, 'body ');

test('control: scope.css without its .kv2-scope scoping, injected into V1, does change it (this is the leak the scoping avoids)', async ({ page }) => {
  expect(UNSCOPED_RESET).not.toContain('kv2-scope');
  expect(UNSCOPED_RESET).toMatch(/box-sizing:\s*border-box/);
  await openRoute(page, '/sources', { lang: 'en', persona: 'technical' });
  const before = await measure(page);
  await page.addStyleTag({ content: UNSCOPED_RESET });
  expect(await measure(page)).not.toBe(before);
});

// ---- BACK-92 R3 (M3): lab parity, ported from e2e-v2/fidelity.spec.ts. The lens views load Manrope (and Cairo in Arabic) from the
// app's own origin, under the embed family names (embed-fonts.css), and make no third-party request. The lab's fonts.css declared
// "Manrope" and "Cairo"; the host deliberately uses "Kawalys BC Manrope" and "Kawalys BC Cairo" so V1's own Cairo stack is untouched
// (see the static check in src/styles/isolation.test.ts).
const LENS_ROUTES = ['/map', '/sources/observatory', '/investigation/INV-DEMO-7/replay', '/agents/deck'] as const;
for (const lang of LANGS) {
  test(`fonts ${lang}: the lens views load Kawalys BC Manrope${lang === 'ar' ? ' and Cairo' : ''} from the app's own origin, nothing from a third party`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    for (const route of LENS_ROUTES) {
      await openScreen(page, route, { lang, persona: 'owner', width: 1440 });
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => ({
        loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
        family: getComputedStyle(document.querySelector('.kv2-scope')!).fontFamily,
      }));
      expect(r.loaded, route).toContain('Kawalys BC Manrope');
      if (lang === 'ar') expect(r.loaded, route).toContain('Kawalys BC Cairo');
      expect(r.family.split(',')[0]!.replace(/"/g, '').trim(), route).toBe(lang === 'ar' ? 'Kawalys BC Cairo' : 'Kawalys BC Manrope');
    }
    const origin = new URL(page.url()).origin;
    const fonts = requests.filter((u) => /\.woff2(\?|$)/.test(u));
    expect(fonts.length).toBeGreaterThan(0);
    for (const u of fonts) expect(u.startsWith(`${origin}/assets/`), u).toBe(true);
    for (const u of requests) expect(u.startsWith(`${origin}/`), `third-party request: ${u}`).toBe(true);
  });
}
