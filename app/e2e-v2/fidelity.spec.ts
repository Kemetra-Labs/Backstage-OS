// BACK-18 fidelity pass: self-hosted fonts, the pre-rendered horizon, luminosity kept to selection and state, and
// rendered-pixel contrast for text that sits over the new light (BACK-15 §6 asks for one rendered check per token set).
import { expect, test, type Page } from '@playwright/test';
import { LANGS, ORIGIN, SCREENS, WIDTHS, load } from './helpers';

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

/** Blur radii of every layer of a computed box-shadow (the third length of each layer). */
function blurRadii(shadow: string): number[] {
  if (shadow === 'none') return [];
  return shadow.split(/,(?![^(]*\))/).map((layer) => {
    const lengths = [...layer.replace(/\([^)]*\)/g, '').matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
    return lengths[2] ?? 0;
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

interface Sample { readonly text: string; readonly ratio: number; readonly min: number; readonly fg: string; readonly bg: string }

/** Rendered contrast for every text run inside the signature panels: text colour against a near-worst (95th percentile)
 *  background pixel under its line boxes, measured with all text made transparent so only the background is sampled. */
async function renderedContrast(page: Page): Promise<Sample[]> {
  const targets = await page.evaluate((sel) => {
    const parse = (c: string): number[] => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (m) return m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      const s = c.match(/color\(srgb ([^)]+)\)/);
      if (s) return s[1]!.split(/[ /]+/).filter(Boolean).map((v, i) => (i < 3 ? Number(v) * 255 : Number(v)));
      throw new Error(`unparsed colour: ${c}`); // never guess: a default would inflate the ratio
    };
    /** Opacity is a group effect: the text renders at the product of its own and every ancestor's opacity. */
    const opacityOf = (el: Element | null): number => {
      let o = 1;
      for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const out: { text: string; rgb: number[]; rects: number[][]; large: boolean }[] = [];
    for (const root of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? '').trim();
        const el = n.parentElement;
        if (!text || !el || el.closest('.kv2-sr, [hidden]')) continue;
        const cs = getComputedStyle(el);
        const opacity = opacityOf(el);
        if (cs.visibility === 'hidden' || opacity === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        // Clip each line box to every scrolling or clipping ancestor: text scrolled out of view is not on screen.
        const clips = [] as DOMRect[];
        for (let a = el.parentElement; a; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible' || getComputedStyle(a).overflowY !== 'visible') clips.push(a.getBoundingClientRect());
        const rects = [...range.getClientRects()].map((r) => {
          let [l, t, rr, b] = [r.left, r.top, r.right, r.bottom];
          for (const c of clips) { l = Math.max(l, c.left); t = Math.max(t, c.top); rr = Math.min(rr, c.right); b = Math.min(b, c.bottom); }
          return [l + scrollX, t + scrollY, rr - l, b - t];
        }).filter(([, , w, h]) => w! > 2 && h! > 4);
        if (!rects.length) continue;
        const size = parseFloat(cs.fontSize);
        const weight = Number(cs.fontWeight);
        const rgb = parse(cs.color);
        rgb[3] = (rgb[3] ?? 1) * opacity;
        out.push({ text: text.slice(0, 40), rgb, rects, large: size >= 24 || (size >= 18.66 && weight >= 700) });
      }
    }
    return out;
  }, SIGNATURE);
  const style = await page.addStyleTag({ content: '* { color: transparent !important; caret-color: transparent !important; text-shadow: none !important; }' });
  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await style.evaluate((s) => (s as Element).remove());
  return page.evaluate(async ({ data, targets }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const lum = (r: number, g: number, b: number): number => {
      const ch = (v: number): number => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    return targets.map((t) => {
      // Background = the 95th-percentile brightest pixel under the line boxes: robust to a 1px star or stroke, still
      // dominated by any glow or horizon that covers a real share of the text.
      const pool: { l: number; c: number[] }[] = [];
      for (const [x, y, w, h] of t.rects) {
        const px = ctx.getImageData(Math.round(x!) + 1, Math.round(y!) + 1, Math.max(1, Math.round(w!) - 2), Math.max(1, Math.round(h!) - 2)).data;
        for (let i = 0; i < px.length; i += 4) pool.push({ l: lum(px[i]!, px[i + 1]!, px[i + 2]!), c: [px[i]!, px[i + 1]!, px[i + 2]!] });
      }
      pool.sort((p, q) => p.l - q.l);
      const pick = pool[Math.min(pool.length - 1, Math.floor(pool.length * 0.95))]!;
      const worst = pick.c;
      const worstL = pick.l;
      const a = t.rgb[3] ?? 1;
      const fg = [0, 1, 2].map((i) => t.rgb[i]! * a + worst[i]! * (1 - a));
      const lf = lum(fg[0]!, fg[1]!, fg[2]!);
      const [hi, lo] = lf > worstL ? [lf, worstL] : [worstL, lf];
      const hex = (c: number[]): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
      return { text: t.text, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, min: t.large ? 3 : 4.5, fg: hex(fg), bg: hex(worst) };
    });
  }, { data: png.toString('base64'), targets });
}

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
