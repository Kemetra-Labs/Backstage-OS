// BACK-92 R7: the shared copy rules, applied once to every copy set behind the one entry point (./index.ts): each host copy tree
// in HOST_COPY and the keyed lens TABLE. Set-specific checks (persona redaction, control vocabulary, wording) stay with each set.
import { describe, expect, it } from 'vitest';
import { HOST_COPY, TABLE, VAR, allCopy, plain, type Entry } from './index';

const PERSONAS = ['owner', 'technical', 'nontechnical'] as const;

/** A sample argument that reads as the number 3 or the string '3', and as a record whose every field is 3 (count records, buckets). */
const ANY: unknown = new Proxy(
  {},
  { get: (_t, p) => (p === Symbol.toPrimitive ? () => 3 : typeof p === 'string' && p in String.prototype ? (String.prototype as never)[p] : 3) },
);

/** Every string in a host copy tree; a function is called with the sample argument in every position. */
function flat(node: unknown, path: string, out: Array<[string, string]>): Array<[string, string]> {
  if (typeof node === 'string') out.push([path, node]);
  else if (typeof node === 'function') {
    out.push([`${path}()`, String((node as (...a: unknown[]) => unknown)(ANY, ANY, ANY))]);
  } else if (Array.isArray(node)) node.forEach((v, i) => flat(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) flat(v, path ? `${path}.${k}` : k, out);
  return out;
}

/** Text an Arabic reader sees as running text: {isolated tokens} and $placeholders removed. */
const running = (s: string): string => s.replace(/\{[^{}]*\}/g, '').replace(VAR, '');
const varsOf = (s: string): string[] => [...s.matchAll(VAR)].map((m) => m[1]!).sort();

/** Provider product names are rendered inside a left-to-right isolate by every caller (<Lt>, <bdi dir="ltr">), not as running text. */
const LATIN_ALLOWED = /^COPY\.provider\./;

const host = Object.entries(HOST_COPY).map(([name, set]) => ({
  name,
  en: flat((set as Record<string, unknown>).en, name, []),
  ar: flat((set as Record<string, unknown>).ar, name, []),
}));
const lens = allCopy();

describe('shared copy rules: host copy trees', () => {
  it('covers every host set', () => {
    expect(host.map((h) => h.name)).toHaveLength(14);
    expect(host.reduce((n, h) => n + h.en.length + h.ar.length, 0)).toBeGreaterThan(1000);
  });

  it.each(host)('$name: same keys in English and Arabic, none empty', ({ en, ar }) => {
    expect(ar.map(([p]) => p).sort()).toEqual(en.map(([p]) => p).sort());
    for (const [p, s] of [...en, ...ar]) expect(s.trim(), p).not.toBe('');
  });

  it.each(host)('$name: balanced braces, Latin digits, no $variables (host trees take arguments as functions)', ({ en, ar }) => {
    for (const [p, s] of [...en, ...ar]) {
      expect((s.match(/\{/g) ?? []).length, `${p}: ${s}`).toBe((s.match(/\}/g) ?? []).length);
      expect(s, p).not.toMatch(/[٠-٩۰-۹]/);
      expect(s, p).not.toMatch(VAR);
    }
  });

  it.each(host)('$name: Latin letters in Arabic only inside {isolates}', ({ ar }) => {
    for (const [p, s] of ar) if (!LATIN_ALLOWED.test(p)) expect(running(s), `${p}: ${s}`).not.toMatch(/[A-Za-z]/);
  });
});

describe('shared copy rules: keyed lens table', () => {
  it('has an English and an Arabic text for every key and persona, none empty', () => {
    for (const [k, e] of Object.entries(TABLE) as Array<[string, Entry]>) {
      const pairs = Array.isArray(e) ? [e] : PERSONAS.map((p) => (e as Record<string, readonly [string, string]>)[p]);
      for (const pr of pairs) {
        expect(pr, k).toHaveLength(2);
        expect(pr![0].trim(), `${k} en`).not.toBe('');
        expect(pr![1].trim(), `${k} ar`).not.toBe('');
        expect(varsOf(pr![1]), k).toEqual(varsOf(pr![0]));
      }
    }
    expect(lens.length).toBeGreaterThan(300);
  });

  it('has balanced braces and Latin digits', () => {
    for (const [k, l, p, s] of lens) {
      expect((s.match(/\{/g) ?? []).length, `${k} ${l} ${p}: ${s}`).toBe((s.match(/\}/g) ?? []).length);
      expect(s, `${k} ${l} ${p}`).not.toMatch(/[٠-٩۰-۹]/);
    }
  });

  it('keeps Latin letters in Arabic inside {isolates}', () => {
    for (const [k, l, p, s] of lens) if (l === 'ar') expect(running(s), `${k} ${p}: ${s}`).not.toMatch(/[A-Za-z]/);
  });
});

describe('shared copy rules: everywhere', () => {
  it('never offers a composite trust or health score', () => {
    const every = [...host.flatMap((h) => [...h.en, ...h.ar].map(([, s]) => s)), ...lens.map(([, , , s]) => s)];
    for (const s of every) expect(plain(s)).not.toMatch(/\b(trust score|overall trust|trust posture|mission health)\b/i);
  });
});
