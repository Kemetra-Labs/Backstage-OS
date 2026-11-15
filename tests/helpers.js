// Shared helpers. Google Fonts is the only external request; it is aborted so runs are offline-deterministic.
const { expect } = require('@playwright/test');

async function openApp(page, state = {}, hash = '') {
  const errors = [], failed = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) failed.push(r.url()); });
  page.on('response', r => { if (r.status() >= 400 && !/fonts\./.test(r.url())) failed.push(r.status() + ' ' + r.url()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  const q = Object.keys(state).length ? '?s=' + encodeURIComponent(JSON.stringify(state)) : '';
  await page.goto('/' + q + hash);
  await expect(page.locator('main#main h1').first()).toBeVisible({ timeout: 5000 }); // loading skeleton (650 ms) gone
  return { errors, failed };
}

const go = async (page, route) => { await page.evaluate(r => go(r), route); await expect(page.locator('main#main h1').first()).toBeVisible(); };
const setSrc = async (page, v) => { await page.evaluate(x => { S.src = x; renderApp(); }, v); };
const hOverflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const overlaps = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

module.exports = { openApp, go, setSrc, hOverflow, overlaps };
