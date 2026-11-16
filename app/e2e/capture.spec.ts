// Screenshot capture for owner review. Runs only with CAPTURE=1 (chromium), so normal e2e runs never rewrite docs/qa.
//   CAPTURE=1 ../node_modules/.bin/playwright test -c playwright.config.ts e2e/capture.spec.ts --project=chromium
import { test, type Page } from '@playwright/test';

test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to capture review screenshots');

const OUT = '../docs/qa/kawalys-frontend/screens';
const SCREENS: ReadonlyArray<[string, string]> = [
  ['01-home', '#/'],
  ['02-portfolio', '#/portfolio'],
  ['03-project-rt', '#/project/RT/stock-sync'],
  ['04-project-kh', '#/project/KH'],
  ['05-project-sb-empty', '#/project/SB'],
  ['06-investigation-inv7', '#/investigation/INV-DEMO-7'],
  ['07-investigation-inv9', '#/investigation/INV-DEMO-9'],
  ['08-evidence-e1', '#/evidence/E-1?from=INV-DEMO-7'],
  ['09-decisions', '#/decisions'],
  ['10-decision-dec3', '#/decisions/DEC-DEMO-3'],
  ['11-agents', '#/agents'],
  ['12-sources', '#/sources'],
];

async function shot(page: Page, name: string, hash: string, q: { lang: string; persona: string; width: number }) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.setViewportSize({ width: q.width, height: q.width < 800 ? 812 : 900 });
  await page.goto(`/?persona=${q.persona}&lang=${q.lang}${hash}`);
  await page.locator('h1').waitFor();
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

for (const [name, hash] of SCREENS) {
  test(`desktop en owner ${name}`, async ({ page }) => shot(page, `desktop-en-owner/${name}`, hash, { lang: 'en', persona: 'owner', width: 1440 }));
}
for (const [name, hash] of SCREENS) {
  test(`desktop ar technical ${name}`, async ({ page }) => shot(page, `desktop-ar-technical/${name}`, hash, { lang: 'ar', persona: 'technical', width: 1440 }));
}
for (const [name, hash] of SCREENS.filter(([n]) => /home|project-rt|inv7|dec3/.test(n))) {
  test(`mobile en nontechnical ${name}`, async ({ page }) => shot(page, `mobile-en-nontechnical/${name}`, hash, { lang: 'en', persona: 'nontechnical', width: 375 }));
  test(`mobile ar owner ${name}`, async ({ page }) => shot(page, `mobile-ar-owner/${name}`, hash, { lang: 'ar', persona: 'owner', width: 375 }));
}
