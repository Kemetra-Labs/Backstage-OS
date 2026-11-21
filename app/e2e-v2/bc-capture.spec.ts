// BACK-27 evidence captures. Not a regression test: it only runs with BC_CAPTURE=1 and writes untracked images to
// docs/design-lab/hybrid-map/out/pilot/ (npm run e2e:v2 skips it). Run: BC_CAPTURE=1 npx playwright test -c playwright.v2.config.ts e2e-v2/bc-capture.spec.ts
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { loadBc, waitForIntroDone, type BcOpts } from './bc-helpers';
import { load } from './helpers';

const OUT = path.resolve('..', 'docs', 'design-lab', 'hybrid-map', 'out', 'pilot');
test.skip(!process.env.BC_CAPTURE, 'capture only');

const shot = async (page: Page, name: string, full = false) => {
  await waitForIntroDone(page); // the one-shot first-load orbit and any trace have finished
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
};

const cases: ReadonlyArray<readonly [string, BcOpts, boolean]> = [
  ['after-en-1448-map', { width: 1448, height: 1086, view: 'map' }, false],
  ['after-ar-1448-map', { width: 1448, height: 1086, view: 'map', lang: 'ar' }, false],
  ['after-en-1448-list', { width: 1448, height: 1620, view: 'list' }, false],
  ['after-ar-1448-list', { width: 1448, height: 1620, view: 'list', lang: 'ar' }, false],
  ['after-en-1448-evidence-github', { width: 1448, height: 1086, view: 'map', node: 'github', tab: 'evidence', persona: 'technical' }, false],
  ['after-en-1448-evidence-sentry-owner', { width: 1448, height: 1086, view: 'map', node: 'sentry', tab: 'evidence' }, false],
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

for (const [name, opts, full] of cases) {
  test(`capture ${name}`, async ({ page }) => {
    await loadBc(page, opts);
    await shot(page, name, full);
  });
}

test('capture after-en-1448-map-reduced-motion', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://127.0.0.1:4279' });
  const page = await ctx.newPage();
  await loadBc(page, { width: 1448, height: 1086, view: 'map' });
  await page.locator('.kv2-bc-node[data-node="github"]').click();
  await shot(page, 'after-en-1448-map-reduced-motion');
  await ctx.close();
});

test('capture after-en-1448-map-first-load-orbit-frame', async ({ page }) => {
  await page.setViewportSize({ width: 1448, height: 1086 });
  await page.goto('/v2.html?concept=bc&view=map#/mission-map?persona=owner&lang=en&node=stock-sync');
  await expect(page.locator('.kv2-bc-canvas')).toBeVisible();
  await page.waitForTimeout(520); // mid-way: orbits drawn, the inner nodes settling
  await page.screenshot({ path: path.join(OUT, 'after-en-1448-map-first-load-orbit-frame.png') });
});

test('capture before: the current V2 map', async ({ page }) => {
  await load(page, { width: 1448, height: 1086 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'before-v2-en-1448-map.png') });
  await load(page, { width: 375, height: 812 });
  await page.screenshot({ path: path.join(OUT, 'before-v2-en-375-map.png'), fullPage: true });
  await load(page, { width: 1448, height: 1086, lang: 'ar' });
  await page.screenshot({ path: path.join(OUT, 'before-v2-ar-1448-map.png') });
});
