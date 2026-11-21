// Static guarantees about V2's source: isolated from V1, no network, tokens only (Hallmark floor 1, 2, 4), no action controls.
import { describe, expect, it } from 'vitest';

// Vitest blanks CSS modules (even with ?raw), so stylesheets are read from disk. The app tsconfig has no node types.
// @ts-ignore node builtin, available at test time
const { readFileSync, existsSync, statSync } = await import('node:fs');
const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8') as string;
const NAMES = ['fonts', 'tokens', 'base', 'map', 'bc', 'observatory', 'replay', 'deck'] as const;
const css: Record<string, string> = Object.fromEntries(NAMES.map((n) => [`./styles/${n}.css`, read(`./styles/${n}.css`)]));
const src = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const v1css: Record<string, string> = Object.fromEntries(['tokens', 'app'].map((n) => [n, read(`../../styles/${n}.css`)]));
const v1main = import.meta.glob('../../main.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const tokens = css['./styles/tokens.css']!;
const defined = new Set(Object.values(css).flatMap((t) => [...t.matchAll(/(--kv2-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!)));
const bodyCss = Object.entries(css).filter(([f]) => !f.endsWith('tokens.css'));

describe('V2 stylesheets', () => {
  it('start with the Hallmark stamp', () => {
    expect(tokens.trimStart().startsWith('/* Hallmark')).toBe(true);
  });

  it('use only tokens for colour: no literal colours outside tokens.css', () => {
    for (const [f, text] of bodyCss) {
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(stripped, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(stripped, f).not.toMatch(/\brgba?\(|\bhsla?\(/);
    }
  });

  it('only reference tokens that exist, and never use transition: all or 100vw', () => {
    for (const [f, text] of Object.entries(css)) {
      for (const m of text.matchAll(/var\((--kv2-[a-z0-9-]+)/g)) expect(defined.has(m[1]!), `${f}: ${m[1]}`).toBe(true);
      expect(text, f).not.toMatch(/transition:\s*all/);
      expect(text, f).not.toMatch(/\b100vw\b/);
    }
  });

  it('clip horizontal overflow on html and body, and honour reduced motion', () => {
    const base = css['./styles/base.css']!;
    expect(base).toMatch(/html\s*\{[^}]*overflow-x:\s*clip/);
    expect(base).toMatch(/body\s*\{[^}]*overflow-x:\s*clip/);
    expect(base).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('scope every screen stylesheet rule to the .kv2- namespace', () => {
    for (const [f, text] of bodyCss.filter(([n]) => !n.endsWith('base.css'))) {
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[^{;]+\{/g, '');
      const selectors = [...stripped.matchAll(/([^{}@;]+)\{/g)].map((m) => m[1]!.trim()).filter((sel) => sel && !/^\d+%$/.test(sel));
      const offenders = selectors.flatMap((list) => list.split(',').map((x) => x.trim())).filter((sel) => !sel.includes('.kv2-') && !sel.includes('.kv2'));
      expect(offenders, f).toEqual([]);
    }
  });

  it('does not import or share any V1 stylesheet, and V1 does not import V2', () => {
    for (const [f, text] of Object.entries(src)) expect(text, f).not.toMatch(/import\s+['"](\.\.\/)+styles\//);
    expect(Object.keys(v1css).length).toBeGreaterThan(0);
    expect(Object.values(v1main)[0]!).not.toMatch(/design-lab/);
  });
});

describe('V2 self-hosted assets (BACK-18)', () => {
  const exists = (rel: string): boolean => existsSync(new URL(rel, import.meta.url)) as boolean;
  const urls = (text: string): string[] => [...text.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]!);

  it('reference no hosted URL from any stylesheet or the HTML entry', () => {
    for (const [f, text] of Object.entries(css)) expect(text.replace(/\/\*[\s\S]*?\*\//g, ''), f).not.toMatch(/https?:\/\/|\/\/fonts\.|@import/);
    expect(read('../../../v2.html')).not.toMatch(/<link[^>]+href=["']https?:|<script[^>]+src=["']https?:/);
  });

  it('declare each face from a local woff2 only (no local() lookup), and every file and its licence ship', () => {
    const fonts = css['./styles/fonts.css']!.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(fonts).not.toMatch(/local\(/);
    const files = urls(fonts);
    expect(files.length).toBe(2);
    for (const rel of files) {
      expect(rel.startsWith('../assets/fonts/') && rel.endsWith('.woff2'), rel).toBe(true);
      expect(exists(rel.replace('../', './')), rel).toBe(true);
    }
    for (const lic of ['OFL-Manrope.txt', 'OFL-Cairo.txt']) expect(read(`./assets/fonts/${lic}`)).toMatch(/SIL Open Font License, Version 1\.1/);
    expect(read('./assets/fonts/SOURCE.md')).toMatch(/@fontsource-variable\/manrope@5\.3\.0[\s\S]*@fontsource-variable\/cairo@5\.3\.0/);
    expect(fonts).toMatch(/font-display:\s*swap/);
  });

  it('serve the horizon from a local webp under 100 KB, laid over the CSS fallback', () => {
    const base = css['./styles/base.css']!;
    expect(urls(base)).toEqual(['../assets/horizon.webp']);
    expect(statSync(new URL('./assets/horizon.webp', import.meta.url)).size).toBeLessThan(100_000);
    expect(base).toMatch(/\.kv2-horizon\s*\{[^}]*radial-gradient/); // the fallback stays when the image is missing
  });
});

describe('V2 sources', () => {
  const files = Object.entries(src);
  it('make no network request, open no socket and store nothing', () => {
    expect(files.length).toBeGreaterThan(20);
    for (const [f, text] of files) {
      expect(text, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/);
      expect(text, f).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/); // only local dev links, no hosted URLs
    }
  });

  it('hold no credential or secret material', () => {
    for (const [f, text] of files) expect(text, f).not.toMatch(/api[_-]?key|secret|password|bearer\s|BEGIN [A-Z ]*PRIVATE/i);
  });

  it('use dangerouslySetInnerHTML and eval nowhere', () => {
    for (const [f, text] of files) expect(text, f).not.toMatch(/dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(/);
  });
});
