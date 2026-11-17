// Captures the V2 screens at the reference size (and other widths) with real Chromium, for visual comparison.
// Usage: node docs/design-lab/v2/tools/capture.mjs [--base http://127.0.0.1:4279] [--out <dir>] [--widths 1448,1440,768,375,320] [--screens a,b] [--lang en] [--persona owner]
// Reads nothing but the local lab URL. Google Fonts hosts are never contacted (the lab uses local fonts).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(path.resolve('app/package.json'));
const { chromium } = require('@playwright/test');

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};

const base = arg('base', 'http://127.0.0.1:4279');
const out = path.resolve(arg('out', 'docs/design-lab/v2/screenshots/v2'));
const widths = arg('widths', '1448').split(',').map(Number);
const screens = arg('screens', 'mission-map,source-observatory,mission-replay,agent-flight-deck').split(',');
const lang = arg('lang', 'en');
const persona = arg('persona', 'owner');
const full = arg('full', 'false') === 'true';
const extra = arg('extra', '');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const width of widths) {
  const height = width >= 1000 ? 1086 : 900;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const bad = [];
  page.on('console', (m) => { if (m.type() === 'error') bad.push(m.text()); });
  page.on('pageerror', (e) => bad.push(String(e)));
  for (const s of screens) {
    const q = `persona=${persona}&lang=${lang}${extra ? `&${extra}` : ''}`;
    await page.goto(`${base}/v2.html#/${s}?${q}`);
    await page.reload();
    await page.waitForSelector('h1');
    await page.waitForTimeout(350);
    const file = path.join(out, `${s}-${lang}-${persona}-${width}.jpg`);
    await page.screenshot({ path: file, fullPage: full });
    console.log(file);
  }
  if (bad.length) console.log('console errors:', bad);
  await ctx.close();
}
await browser.close();
