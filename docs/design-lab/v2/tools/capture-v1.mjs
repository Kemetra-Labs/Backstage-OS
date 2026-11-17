// Captures the CURRENT (V1) screens at the reference size for the V1 / V2 comparison.
// Static prototype: python -m http.server 8765 --bind 127.0.0.1 (repo root). React S1 slice: vite preview on 4178.
// Usage: node docs/design-lab/v2/tools/capture-v1.mjs [--static http://127.0.0.1:8765] [--react http://127.0.0.1:4178] [--out <dir>]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(path.resolve('app/package.json'));
const { chromium } = require('@playwright/test');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const staticBase = arg('static', 'http://127.0.0.1:8765');
const reactBase = arg('react', '');
const out = path.resolve(arg('out', 'docs/design-lab/v2/screenshots/v1'));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1448, height: 1086 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

for (const [route, label] of [['network', 'mission-map'], ['sources', 'source-observatory'], ['investigation', 'mission-replay'], ['agents', 'agent-flight-deck']]) {
  await page.goto(`${staticBase}/`);
  await page.waitForSelector('main#main h1', { timeout: 8000 }); // the prototype shows a 650 ms loading skeleton first
  await page.evaluate((r) => window.go(r), route);
  await page.waitForSelector('main#main h1');
  await page.waitForTimeout(700);
  const file = path.join(out, `${label}-v1-static-1448.jpg`);
  await page.screenshot({ path: file });
  console.log(file);
}
if (reactBase) {
  await page.goto(`${reactBase}/?persona=owner&lang=en`);
  await page.waitForSelector('h1');
  await page.waitForTimeout(400);
  const file = path.join(out, 'mission-replay-v1-react-s1-1448.jpg');
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
