// BACK-92 R3 (M1 to M7): the lab's fidelity and motion probes, ported from e2e-v2/fidelity.spec.ts and e2e-v2/bc-helpers.ts so the
// host lens specs keep that coverage once the lab suite is retired. Same measurements; the selectors are the embedded lenses' own.
import { expect, test, type Page } from '@playwright/test';

/** Blur radii of every layer of a computed box-shadow (the third length of each layer). */
export function blurRadii(shadow: string): number[] {
  if (shadow === 'none') return [];
  return shadow.split(/,(?![^(]*\))/).map((layer) => {
    const lengths = [...layer.replace(/\([^)]*\)/g, '').matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
    return lengths[2] ?? 0;
  });
}

/** Waits until no animation is running. A looping animation never settles, so this fails (times out) on one. */
export async function waitForAnimationsSettled(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running'), null, { timeout });
}

/** Waits for the map's first-load orbit to finish (the canvas drops data-intro), then for every animation to settle. */
export async function waitForIntroDone(page: Page): Promise<void> {
  await expect(page.locator('.kv2-bc-canvas[data-intro]')).toHaveCount(0, { timeout: 10_000 });
  await waitForAnimationsSettled(page, 10_000);
}

/** Every animation that never ends (iterations === Infinity), described as "target class + animationName". */
export async function infiniteAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document.getAnimations().flatMap((a) => {
      if (a.effect?.getTiming().iterations !== Infinity) return [];
      const t = (a.effect as KeyframeEffect).target as Element | null;
      const cls = t ? (t.getAttribute('class') ?? t.tagName) : 'unknown';
      return [`${cls} ${(a as CSSAnimation).animationName ?? '(script)'}`];
    }),
  );
}

/** Visible interactive elements inside `root` smaller than 44 x 44 px, described for the failure message. */
export async function smallTargets(page: Page, root: string): Promise<string[]> {
  return page.locator(root).locator('button, a[href], select, input[type="search"]').evaluateAll((els) =>
    els.flatMap((e) => {
      const host = (e.closest('label.kv2-select, .kv2-search') as HTMLElement | null) ?? (e as HTMLElement);
      const r = host.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || e.closest('[hidden]') || e.closest('.kv2-sr')) return [];
      if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0) return [];
      return r.width < 43.5 || r.height < 43.5 ? [`${e.tagName}.${(e as HTMLElement).className} ${Math.round(r.width)}x${Math.round(r.height)} ${(e.textContent ?? '').trim().slice(0, 24)}`] : [];
    }),
  );
}

/** Elements of the B+C map that stick out past the viewport's left or right edge (scrolling tables excluded). */
export async function clippedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = '.kv2-bc button, .kv2-bc h1, .kv2-bc h2, .kv2-bc-card, .kv2-bc-key, .kv2-bc-tl, .kv2-bc-readings, .kv2-bc-insp, .kv2-bc-title, .kv2-bc-top, .kv2-bc-panel, .kv2-bc-canvas, .kv2-kpi';
    for (const e of document.querySelectorAll<HTMLElement>(sel)) {
      if (e.closest('.kv2-table-wrap, .kv2-seg') && !e.matches('.kv2-bc-panel')) continue; // these scroll inside themselves
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(e).visibility === 'hidden') continue;
      if (r.left < -0.5 || r.right > window.innerWidth + 0.5) out.push(`${e.tagName}.${e.className.toString().slice(0, 40)} ${Math.round(r.left)}..${Math.round(r.right)} of ${window.innerWidth}`);
    }
    return out;
  });
}

export interface ContrastSample { readonly text: string; readonly ratio: number; readonly min: number; readonly fg: string; readonly bg: string }

/** Rendered contrast for every text run inside `signature`: text colour against a near-worst (95th percentile) background pixel
 *  under its line boxes, measured with all text made transparent so only the background is sampled. axe cannot judge text over an
 *  image, a gradient or a glow; this reads the pixels. */
export async function renderedContrast(page: Page, signature: string): Promise<ContrastSample[]> {
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
        // Clip each line box to every scrolling or clipping ancestor: text scrolled out of view is not on screen. An ancestor with
        // display: contents has no box, so its overflow clips nothing (the B+C stage uses it below 1180 px); it is skipped.
        const clips = [] as DOMRect[];
        for (let a = el.parentElement; a; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.display !== 'contents' && (acs.overflowX !== 'visible' || acs.overflowY !== 'visible')) clips.push(a.getBoundingClientRect());
        }
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
  }, signature);
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

/** Asserts every sampled run keeps AA, and records the worst one as an annotation. */
export async function expectRenderedAA(page: Page, signature: string, label: string): Promise<void> {
  const samples = await renderedContrast(page, signature);
  expect(samples.length).toBeGreaterThan(5);
  const worst = [...samples].sort((a, b) => a.ratio / a.min - b.ratio / b.min)[0]!;
  test.info().annotations.push({ type: 'contrast', description: `${label}: ${samples.length} runs, worst ${worst.ratio}:1 (needs ${worst.min}) "${worst.text}"` });
  const failing = samples.filter((s) => s.ratio < s.min);
  expect(failing, JSON.stringify(failing)).toEqual([]);
}
