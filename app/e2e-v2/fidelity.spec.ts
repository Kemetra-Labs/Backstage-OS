// BACK-18 fidelity pass: self-hosted fonts, the pre-rendered horizon, luminosity kept to selection and state, and
// rendered-pixel contrast for text that sits over the new light (BACK-15 §6 asks for one rendered check per token set).
import { expect, test, type Page } from '@playwright/test';
import { LANGS, ORIGIN, SCREENS, WIDTHS, load } from './helpers';
import { blurRadii, renderedContrast as contrastIn, type ContrastSample as Sample } from '../e2e/lens-fidelity';

const renderedContrast = (page: Page): Promise<Sample[]> => contrastIn(page, SIGNATURE);

const SIGNATURE = '.kv2-canvas, .kv2-posture, .kv2-stage-panel, .kv2-fleet';

for (const lang of LANGS) {
  test(`fonts ${lang}: Manrope${lang === 'ar' ? ' and Cairo' : ''} load from the lab's own origin`, async ({ page }) => {
    const probe = await load(page, { lang });
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
    expect(loaded).toContain('Manrope');
    if (lang === 'ar') expect(loaded).toContain('Cairo');
    const fonts = probe.requests.filter((u) => /\.woff2(\?|$)/.test(u));
    expect(fonts.length).toBeGreaterThan(0);
    for (const u of fonts) expect(u.startsWith(`${ORIGIN}/assets/`), u).toBe(true);
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family.split(',')[0]!.replace(/"/g, '').trim()).toBe(lang === 'ar' ? 'Cairo' : 'Manrope');
  });
}

for (const screen of ['mission-map', 'source-observatory'] as const) {
  test(`horizon ${screen}: the pre-rendered planet is served locally and sits over the CSS fallback`, async ({ page }) => {
    const responses: { url: string; status: number }[] = [];
    page.on('response', (r) => { if (r.url().includes('horizon')) responses.push({ url: r.url(), status: r.status() }); });
    await load(page, { screen });
    const bg = await page.locator('.kv2-horizon').first().evaluate((el) => ({
      image: getComputedStyle(el, '::before').backgroundImage,
      fallback: getComputedStyle(el).backgroundImage,
      hidden: el.closest('[aria-hidden="true"]') !== null,
    }));
    expect(bg.image).toMatch(/horizon[^)]*\.webp/);
    expect(bg.fallback).toMatch(/gradient/);
    expect(bg.hidden).toBe(true);
    await expect.poll(() => responses.length).toBeGreaterThan(0);
    for (const r of responses) {
      expect(r.url.startsWith(`${ORIGIN}/assets/`), r.url).toBe(true);
      expect(r.status).toBe(200);
    }
  });
}

test('luminosity: unknown and unavailable nodes at rest carry no glow; the selected node and observed links do', async ({ page }) => {
  await load(page, { screen: 'mission-map' });
  const quiet = await page.locator('.kv2-node:not([data-selected])').evaluateAll((els) =>
    els.filter((e) => ['unk', 'bad'].includes(e.getAttribute('data-tone') ?? '')).map((e) => ({ id: e.getAttribute('data-node'), shadow: getComputedStyle(e.querySelector('.kv2-orb')!).boxShadow })),
  );
  expect(quiet.length).toBeGreaterThan(3);
  for (const n of quiet) expect(blurRadii(n.shadow).every((b) => b === 0), `${n.id}: ${n.shadow}`).toBe(true);
  const selected = await page.locator('.kv2-node[data-selected] .kv2-orb').evaluate((e) => getComputedStyle(e).boxShadow);
  expect(Math.max(...blurRadii(selected))).toBeGreaterThan(20);
  const observed = await page.locator('.kv2-edge[data-truth="observed"] path').first().evaluate((e) => getComputedStyle(e).filter);
  expect((observed.match(/drop-shadow/g) ?? []).length).toBe(2);
});

test('luminosity: agent satellites with an unknown state carry no glow; observing ones keep it', async ({ page }) => {
  await load(page, { screen: 'agent-flight-deck' });
  // The demo fleet has no drafting or idle agent today, so the last satellite is switched to the unknown tone in place
  // to exercise the stylesheet rule that a real drafting/idle state would hit (STATUS_TONE in AgentFlightDeck.tsx).
  await page.locator('.kv2-sat').last().evaluate((e) => e.setAttribute('data-tone', 'unk'));
  const sats = await page.locator('.kv2-sat').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-sat'), tone: e.getAttribute('data-tone'), shadow: getComputedStyle(e.querySelector('.kv2-sat-orb')!).boxShadow })));
  const unk = sats.filter((s) => s.tone === 'unk' || s.tone === 'bad');
  expect(unk.length).toBeGreaterThan(0);
  for (const s of unk) expect(blurRadii(s.shadow).every((b) => b === 0), `${s.id}: ${s.shadow}`).toBe(true);
  for (const s of sats.filter((x) => x.tone === 'ok')) expect(Math.max(...blurRadii(s.shadow)), `${s.id}`).toBeGreaterThan(0);
});

/** Rendered contrast for every text run inside the signature panels: text colour against a near-worst (95th percentile)
 *  background pixel under its line boxes, measured with all text made transparent so only the background is sampled. */
for (const screen of SCREENS) {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      test(`contrast ${screen} ${lang} @${width}px: text over the horizon and glow keeps AA on rendered pixels`, async ({ page }, info) => {
        await load(page, { screen, lang, width });
        // Below 860 px the map opens as its list (the table alternative); there is no scene to sample.
        test.skip(!(await page.locator(SIGNATURE).first().isVisible()), 'no signature scene at this width');
        const samples = await renderedContrast(page);
        expect(samples.length).toBeGreaterThan(5);
        const worst = [...samples].sort((a, b) => a.ratio / a.min - b.ratio / b.min)[0]!;
        info.annotations.push({ type: 'contrast', description: `${screen} ${lang} ${width}: ${samples.length} runs, worst ${worst.ratio}:1 (needs ${worst.min}) "${worst.text}"` });
        const failing = samples.filter((s) => s.ratio < s.min);
        expect(failing, JSON.stringify(failing)).toEqual([]);
      });
    }
  }
}
