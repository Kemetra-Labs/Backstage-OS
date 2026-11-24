// BACK-27 / BACK-34 evidence captures of the B+C Mission Map, retargeted from the retired lab (e2e-v2/bc-capture.spec.ts, BACK-92 R4)
// onto the host route /?lang=..&persona=..#/map/retail-tower/<node>. Not a regression test: it runs only with BC_CAPTURE=1, on chromium
// (`npm run e2e` skips it). The "after-*" images go to docs/design-lab/hybrid-map/out/pilot/, which is not tracked. The back34-*
// captures are written to docs/design-lab/hybrid-map/out/BACK-34/ and ARE committed, so re-running them changes tracked files: the
// committed set was taken on the lab and stays the BACK-34 record until someone decides to refresh it from the host.
// The lab's "before" captures (concept A, the lab's default map) retired with concept A and are not carried over.
// Run: BC_CAPTURE=1 npx playwright test e2e/bc-capture.spec.ts --project=chromium   (add -g back34 for the tracked set only)
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { waitForIntroDone } from './lens-fidelity';
import { setMapMode } from './lens-helpers';

const OUT = path.resolve('..', 'docs', 'design-lab', 'hybrid-map', 'out', 'pilot');
const OUT_34 = path.resolve('..', 'docs', 'design-lab', 'hybrid-map', 'out', 'BACK-34');

interface Shot {
  readonly width: number;
  readonly height: number;
  readonly view: 'map' | 'list';
  readonly lang?: 'en' | 'ar';
  readonly persona?: 'owner' | 'technical' | 'nontechnical';
  readonly node?: string;
  /** Inspector tab, opened by its role=tab name. */
  readonly tab?: 'Evidence' | 'Sources';
}

test.skip(!process.env.BC_CAPTURE, 'capture only (BC_CAPTURE=1)');
test.skip(({ browserName }) => browserName !== 'chromium', 'captures are taken on chromium only');

/** Opens the host map with the shot's language, persona, node and mode, and asserts what the capture is meant to show. */
async function openShot(page: Page, s: Shot): Promise<void> {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.setViewportSize({ width: s.width, height: s.height });
  const node = s.node ?? 'stock-sync';
  await page.goto(`/?lang=${s.lang ?? 'en'}&persona=${s.persona ?? 'owner'}#/map/retail-tower/${node}`);
  await expect(page.locator('[data-testid="mission-map-lens"]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', s.lang ?? 'en');
  await setMapMode(page, s.view);
  if (s.view === 'map') await expect(page.locator(`.kv2-bc-node[data-node="${node}"]`)).toHaveAttribute('aria-pressed', 'true');
  else await expect(page.locator('.kv2-bc-ledger tr[data-selected] button')).toHaveAttribute('data-node', node);
  if (s.tab) {
    const tab = page.getByRole('tab', { name: s.tab, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  await page.evaluate(() => document.fonts.ready);
}

const shot = async (page: Page, name: string, full: boolean, dir: string) => {
  await waitForIntroDone(page); // the one-shot first-load orbit and any trace have finished
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  expect(file.endsWith('.png')).toBe(true);
};

const cases: ReadonlyArray<readonly [string, Shot, boolean]> = [
  ['after-en-1448-map', { width: 1448, height: 1086, view: 'map' }, false],
  ['after-ar-1448-map', { width: 1448, height: 1086, view: 'map', lang: 'ar' }, false],
  ['after-en-1448-list', { width: 1448, height: 1620, view: 'list' }, false],
  ['after-ar-1448-list', { width: 1448, height: 1620, view: 'list', lang: 'ar' }, false],
  ['after-en-1448-evidence-github', { width: 1448, height: 1086, view: 'map', node: 'github', tab: 'Evidence', persona: 'technical' }, false],
  ['after-en-1448-evidence-sentry-owner', { width: 1448, height: 1086, view: 'map', node: 'sentry', tab: 'Evidence' }, false],
  ['after-en-1448-selected-sentry', { width: 1448, height: 1086, view: 'map', node: 'sentry' }, false],
  ['after-en-1024-map', { width: 1024, height: 900, view: 'map' }, false],
  ['after-en-768-map', { width: 768, height: 1024, view: 'map' }, true],
  ['after-en-375-list', { width: 375, height: 812, view: 'list' }, true],
  ['after-ar-375-list', { width: 375, height: 812, view: 'list', lang: 'ar' }, true],
  ['after-en-375-map', { width: 375, height: 812, view: 'map' }, true],
  ['after-ar-375-map', { width: 375, height: 812, view: 'map', lang: 'ar' }, true],
  ['after-en-320-list', { width: 320, height: 700, view: 'list' }, true],
  ['after-en-320-map', { width: 320, height: 700, view: 'map' }, true],
];

for (const [name, s, full] of cases) {
  test(`capture ${name}`, async ({ page }) => {
    await openShot(page, s);
    await shot(page, name, full, OUT);
  });
}

test('capture after-en-1448-map-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openShot(page, { width: 1448, height: 1086, view: 'map' });
  await page.locator('.kv2-bc-node[data-node="github"]').click();
  await expect(page.locator('.kv2-bc-node[data-node="github"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await shot(page, 'after-en-1448-map-reduced-motion', false, OUT);
});

test('capture after-en-1448-map-first-load-orbit-frame', async ({ page }) => {
  await page.setViewportSize({ width: 1448, height: 1086 });
  await page.goto('/?lang=en&persona=owner#/map/retail-tower/stock-sync');
  await expect(page.locator('.kv2-bc-canvas')).toBeVisible();
  await page.waitForTimeout(520); // mid-way: orbits drawn, the inner nodes settling
  await page.screenshot({ path: path.join(OUT, 'after-en-1448-map-first-load-orbit-frame.png') });
  await expect(page.locator('.kv2-bc-node')).toHaveCount(10);
});

// BACK-34: phone map legibility (non-scaling link markers and strokes). Writes the TRACKED set under out/BACK-34/; run with -g back34.
const back34: ReadonlyArray<readonly [string, Shot]> = [
  ...(['en', 'ar'] as const).flatMap((lang) => ([[320, 700], [375, 812], [640, 900], [768, 1024]] as const).map(([width, height]) => [`back34-${lang}-${width}-map`, { width, height, view: 'map', lang }] as const)),
  ['back34-en-375-list', { width: 375, height: 812, view: 'list' }],
  ['back34-ar-375-list', { width: 375, height: 812, view: 'list', lang: 'ar' }],
];

for (const [name, s] of back34) {
  test(`capture ${name}`, async ({ page }) => {
    await openShot(page, s);
    if (s.view === 'map') await expect(page.locator('.kv2-bc-canvas > .kv2-bc-mk').first()).toBeVisible();
    await shot(page, name, true, OUT_34);
  });
}
