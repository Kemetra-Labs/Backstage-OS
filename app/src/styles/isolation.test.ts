// BACK-86 (S4): the B+C map's stylesheets can sit in the host app without restyling a V1 screen, and the semantic role layer keeps
// both identities. Static guarantees over the CSS text; the browser-side proof (computed styles of the V1 screens with the B+C
// sheets injected) is e2e/css-isolation.spec.ts. Synthetic demo UI only.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel: string): string => readFileSync(here(rel), 'utf8');
const V2 = '../design-lab/v2/styles/';

/** Every stylesheet the host would import to embed the map. reset.css and fonts.css are the lab's and are deliberately not here. */
export const EMBED = ['tokens', 'base', 'scope', 'embed-fonts', 'map', 'bc', 'observatory', 'replay', 'deck'] as const;

interface Parsed { readonly rules: { readonly sel: string; readonly body: string }[]; readonly fontFaces: string[]; readonly keyframes: string[] }

function parse(text: string): Parsed {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Parsed = { rules: [], fontFaces: [], keyframes: [] };
  const scan = (s: string): void => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < s.length && depth > 0) { if (s[j] === '{') depth += 1; else if (s[j] === '}') depth -= 1; j += 1; }
      const body = s.slice(open + 1, j - 1);
      i = j;
      if (head.startsWith('@font-face')) out.fontFaces.push(body);
      else if (head.startsWith('@keyframes')) out.keyframes.push(head.replace('@keyframes', '').trim());
      else if (head.startsWith('@')) scan(body);
      else out.rules.push({ sel: head, body });
    }
  };
  scan(src);
  return out;
}

/** Splits a selector list on top-level commas (not the ones inside :where(a, b)). */
function selectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const decls = (body: string): string[] => body.split(';').map((d) => d.trim()).filter(Boolean);
const customOnly = (body: string): boolean => decls(body).every((d) => /^(--[\w-]+|color-scheme)\s*:/.test(d));
const norm = (s: string): string => s.replace(/\s+/g, ' ').replace(/\s*:\s*/g, ':').trim();

const css = Object.fromEntries(EMBED.map((n) => [n, read(`${V2}${n}.css`)])) as Record<(typeof EMBED)[number], string>;
const semantic = read('./semantic.css');

describe('the embeddable B+C stylesheets are scoped to .kv2-', () => {
  it.each(EMBED)('%s.css: every selector carries a .kv2- class, or is a custom-property-only rule', (name) => {
    const offenders = parse(css[name]).rules.flatMap((r) => selectors(r.sel).map((sel) => ({ sel, body: r.body })))
      .filter(({ sel, body }) => !sel.includes('.kv2-') && !customOnly(body)).map((o) => o.sel);
    expect(offenders).toEqual([]);
  });

  it('names every keyframe with the kv2- prefix, so none can replace a V1 animation', () => {
    for (const name of EMBED) for (const k of parse(css[name]).keyframes) expect(k.startsWith('kv2-'), `${name}: ${k}`).toBe(true);
  });

  it('declares fonts only under names the host does not use, and the lab\'s own fonts.css is not part of the set', () => {
    expect(EMBED as readonly string[]).not.toContain('fonts');
    const faces = parse(css['embed-fonts']).fontFaces;
    expect(faces.length).toBe(2);
    for (const body of faces) expect(body).toMatch(/font-family:\s*"Kawalys BC (Manrope|Cairo)"/);
    for (const name of EMBED) {
      for (const body of parse(css[name]).fontFaces) expect(body, name).not.toMatch(/font-family:\s*"(Cairo|Manrope|Inter)"/);
    }
    const files = [...css['embed-fonts'].matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]!);
    expect(files.length).toBe(2);
    for (const rel of files) expect(existsSync(here(`${V2}${rel}`)), rel).toBe(true);
    expect(css['embed-fonts']).not.toMatch(/local\(|https?:\/\/|@import/);
  });

  it('keeps the host\'s own font stack untouched: V1 tokens name Cairo, and nothing here declares that face', () => {
    expect(read('./tokens.css')).toMatch(/--f-ar:\s*"Cairo"/);
    expect(read(`${V2}embed-fonts.css`)).not.toMatch(/font-family:\s*"Cairo"/);
  });
});

describe('the lab keeps its global reset, in one file the host never imports', () => {
  const reset = parse(read(`${V2}reset.css`));

  it('reset.css holds the global rules, base.css keeps none of them', () => {
    expect(reset.rules.some((r) => selectors(r.sel).includes('body'))).toBe(true);
    expect(reset.rules.some((r) => selectors(r.sel).includes('*'))).toBe(true);
    for (const r of parse(css.base).rules) for (const sel of selectors(r.sel)) expect(sel.startsWith('.kv2-') || customOnly(r.body) || sel.includes('.kv2-'), sel).toBe(true);
  });

  it('only the lab entry imports it; the host entry and the embed set do not', () => {
    expect(read('../design-lab/v2/main.tsx')).toMatch(/styles\/reset\.css/);
    expect(read('../main.tsx')).not.toMatch(/reset\.css|design-lab/);
    const noComments = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const name of EMBED) expect(noComments(css[name]), name).not.toMatch(/reset\.css/);
  });

  it('scope.css re-states every declaration of the reset under .kv2-scope (so the map renders as in the lab), except the two the host owns', () => {
    const scope = norm(css.scope);
    // body margin and the page background belong to the host document, not to a region inside it.
    const hostOwned = new Set(['background:var(--kv2-bg)']);
    for (const r of reset.rules) {
      for (const d of decls(r.body).map(norm)) {
        if (hostOwned.has(d)) continue;
        expect(scope.includes(d), `${r.sel} { ${d} }`).toBe(true);
      }
    }
    for (const r of parse(css.scope).rules) for (const sel of selectors(r.sel)) expect(sel.includes('.kv2-scope'), sel).toBe(true);
  });

  it('scope.css rules are zero-specificity element resets, except the one layout rule for the region itself, so every .kv2-* class still wins', () => {
    for (const r of parse(css.scope).rules) {
      if (/:focus-visible/.test(r.sel)) continue;
      for (const sel of selectors(r.sel)) {
        // .kv2-scope alone is the region (a layout rule); everything inside it is wrapped in :where().
        expect(sel.startsWith(':where(') || sel === '.kv2-scope', sel).toBe(true);
      }
    }
  });
});

describe('semantic roles', () => {
  const parsed = parse(semantic);
  const v1Tokens = read('./tokens.css');
  const v2Tokens = css.tokens;
  const defined = (text: string): Set<string> => new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
  const roles = (sel: string): Map<string, string> => new Map(
    parsed.rules.filter((r) => r.sel === sel).flatMap((r) => decls(r.body)).map((d) => {
      const [k, v] = d.split(/:(.*)/s);
      return [k!.trim(), v!.trim()] as const;
    }),
  );
  const host = roles(':root');
  const map = roles('.kv2-scope');

  it('is only two rule sets, :root for the host and .kv2-scope for the map, and sets only --sem-* properties', () => {
    expect([...new Set(parsed.rules.map((r) => r.sel))].sort()).toEqual(['.kv2-scope', ':root']);
    for (const k of [...host.keys(), ...map.keys()]) expect(k.startsWith('--sem-'), k).toBe(true);
  });

  it('defines every role for both surfaces, and the two surfaces define the same roles', () => {
    expect([...host.keys()].sort()).toEqual([...map.keys()].sort());
    for (const need of ['surface', 'ink', 'focus', 'truth-observed', 'truth-correlated', 'truth-hypothesis', 'truth-proposed', 'truth-approved', 'truth-unknown',
      'health-healthy', 'health-degraded', 'health-down', 'health-unknown', 'radius-md', 'ease']) {
      expect(host.has(`--sem-${need}`), need).toBe(true);
    }
  });

  it('has no value of its own: each role is a var() of a token that exists in its own source', () => {
    const hostTokens = defined(v1Tokens);
    const mapTokens = defined(v2Tokens);
    for (const [k, v] of host) expect(v.match(/^var\((--[a-z0-9-]+)\)$/)?.[1] && hostTokens.has(v.match(/^var\((--[a-z0-9-]+)\)$/)![1]!), `${k}: ${v}`).toBe(true);
    for (const [k, v] of map) expect(v.match(/^var\((--kv2-[a-z0-9-]+)\)$/)?.[1] && mapTokens.has(v.match(/^var\((--kv2-[a-z0-9-]+)\)$/)![1]!), `${k}: ${v}`).toBe(true);
  });

  it('keeps each truth label, health state and Unknown on its own colour, in both surfaces (Unknown is never Healthy)', () => {
    for (const set of [host, map]) {
      const truth = ['observed', 'correlated', 'hypothesis', 'proposed', 'unknown'].map((n) => set.get(`--sem-truth-${n}`));
      expect(new Set(truth).size).toBe(truth.length);
      const health = ['healthy', 'degraded', 'down', 'unknown'].map((n) => set.get(`--sem-health-${n}`));
      expect(new Set(health).size).toBe(health.length);
      expect(set.get('--sem-health-unknown')).not.toBe(set.get('--sem-health-healthy'));
    }
  });

  it('keeps the two identities: the host focus stays gold, the map focus stays cyan, no role was unified', () => {
    expect(host.get('--sem-focus')).toBe('var(--gold)');
    expect(map.get('--sem-focus')).toBe('var(--kv2-cyan)');
    for (const [k, v] of host) expect(v, k).not.toContain('kv2');
  });

  it('keeps V1 and the map\'s own truth wording aligned: same four labels map to same-named tokens', () => {
    for (const [role, hostTok, mapTok] of [
      ['observed', '--obs', '--kv2-obs'], ['correlated', '--cor', '--kv2-cor'], ['hypothesis', '--hyp', '--kv2-hyp'], ['proposed', '--pro', '--kv2-pro'],
    ] as const) {
      expect(host.get(`--sem-truth-${role}`)).toBe(`var(${hostTok})`);
      expect(map.get(`--sem-truth-${role}`)).toBe(`var(${mapTok})`);
    }
  });

  it('is not imported by either entry yet: the V1 bundle stays free of .kv2- until the map mounts (e2e-v2 structure.spec isolation guard)', () => {
    expect(read('../main.tsx')).not.toMatch(/semantic\.css/);
    expect(read('../design-lab/v2/main.tsx')).not.toMatch(/semantic\.css/);
  });
});
