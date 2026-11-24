// BACK-92 R7: proof that the translation refactor changed no rendered string. Every key of the host copy trees and of the lens
// tables is rendered for en/ar x owner/technical/nontechnical with representative arguments, and compared with a committed
// fixture. The fixture was recorded before the refactor; any difference in any string, in either language, fails this test.
import { describe, expect, it } from 'vitest';
import { HOST_COPY, TABLE, translate, type K } from './index';

const LANGS = ['en', 'ar'] as const;
const PERSONAS = ['owner', 'technical', 'nontechnical'] as const;

/** Any property reads as 2: stands in for count records and bucket objects passed to copy functions. */
const anyCounts = new Proxy({}, { get: (_t, p) => (p === Symbol.toPrimitive ? () => 'P' : 2) });
/** Argument sets every copy function is called with; one that throws is recorded as such (deterministically). */
const ARG_SETS: ReadonlyArray<readonly unknown[]> = [[0], [1, 2, 'W'], [3, 5, 'W'], ['X-1', 'Y-2', 'Z-3'], [anyCounts, 4, 'W']];

function flat(node: unknown, path: string, out: Record<string, string>): void {
  if (typeof node === 'string') out[path] = node;
  else if (typeof node === 'function') {
    ARG_SETS.forEach((args, i) => {
      try {
        out[`${path}(${i})`] = String((node as (...a: unknown[]) => unknown)(...args));
      } catch (e) {
        out[`${path}(${i})`] = `throws: ${(e as Error).message}`;
      }
    });
  } else if (Array.isArray(node)) node.forEach((v, i) => flat(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) flat(v, `${path}.${k}`, out);
}

/** Representative values for $variables: a number for count-like names, a marked token otherwise. */
const SAMPLE_VARS = new Proxy({} as Record<string, string | number>, {
  has: () => true,
  get: (_t, p) => (typeof p === 'string' && /^(n|of|m|x|c|k|total|count|h|min|max)$/.test(p) ? 7 : `<${String(p)}>`),
});

function renderAll(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, set] of Object.entries(HOST_COPY)) for (const lang of LANGS) flat((set as Record<string, unknown>)[lang], `host:${name}.${lang}`, out);
  for (const key of Object.keys(TABLE).sort()) {
    for (const lang of LANGS) {
      for (const p of PERSONAS) {
        out[`lens:${key}|${lang}|${p}`] = translate(key as K, lang, p);
        out[`lens:${key}|${lang}|${p}|vars`] = translate(key as K, lang, p, SAMPLE_VARS);
      }
    }
  }
  return out;
}

describe('every rendered string, both systems (BACK-92 R7)', () => {
  it('is identical to the recorded fixture', async () => {
    const all = renderAll();
    expect(Object.keys(all).length).toBeGreaterThan(5000);
    await expect(JSON.stringify(all, null, 1) + '\n').toMatchFileSnapshot('./__snapshots__/all-copy.json');
  });
});
