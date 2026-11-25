// BACK-92 R7: the one non-disclosure probe (M05-D05-B). Owner and Nontechnical must see no trace of a Technical-only record: not its
// id, its observation id, its title in any persona's wording or either language, its rule or source link, and not the "restricted"
// placeholder copy that would stand in for it. The tokens are derived from the canonical fixture and the shipped copy, never typed by
// hand, so a new Technical-only record or a new placeholder string is covered without editing a spec. The probe reads every place a
// token could hide (visible text, hidden text, the address, every attribute, form values, comments) and says where it found each one.
// Persona is a display switch on synthetic demo data, not authorization: this checks the demo's scoping, not a server-side control.
import { expect, type Page } from '@playwright/test';
import type { EvidenceReference, Lang, Persona } from '../src/contract/types';
import { DOMAIN } from '../src/domain/fixture';
import { WORLD as V1_WORLD } from '../src/fixture/world';
import { COPY } from '../src/i18n/strings';
import { SHELL } from '../src/i18n/shell';
import { HOME_COPY } from '../src/i18n/screens/home';
import { EVIDENCE as EVIDENCE_COPY } from '../src/i18n/screens/evidence';
import { WORLD as LENS_WORLD } from '../src/lenses/fixtures/world';
import { TABLE } from '../src/i18n/index';

const LANGS: readonly Lang[] = ['en', 'ar'];
const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];
const plain = (s: string): string => s.replace(/[{}]/g, '');

/** Every Technical-only record in the three fixtures that render (canonical domain, V1 world, lens world), once each. */
export const WITHHELD: readonly EvidenceReference[] = [
  ...new Map(
    [...Object.values(DOMAIN.evidence), ...Object.values(V1_WORLD.evidence), ...Object.values(LENS_WORLD.evidenceById)]
      .filter((e) => e.visibility === 'technical')
      .map((e) => [e.id, e] as const),
  ).values(),
];

/** Record ids and the ids of the observations behind them: two cues that a withheld record exists. */
export const RESTRICTED_IDS: readonly string[] = [...WITHHELD.map((e) => e.id), ...WITHHELD.flatMap((e) => (e.observation ? [e.observation.id] : []))];

export type TokenKind = 'id' | 'title' | 'record' | 'placeholder' | 'extra';
export interface Token {
  readonly value: string;
  readonly kind: TokenKind;
  /** Where the token came from, for the failure message. */
  readonly from: string;
}

const titlesOf = (id: string): Token[] =>
  LANGS.flatMap((lang) => PERSONAS.flatMap((p) => {
    const t = COPY[lang].evidenceItem[id]?.[p] ?? V1_WORLD.evidenceText[id]?.[p][lang];
    return t ? [{ value: plain(t), kind: 'title' as const, from: `${id} title ${p}/${lang}` }] : [];
  }));

const recordFields = (e: EvidenceReference): Token[] => [
  ...(e.rule ? [{ value: e.rule, kind: 'record' as const, from: `${e.id} rule` }] : []),
  ...(e.observation?.sourceUrl ? [{ value: e.observation.sourceUrl, kind: 'record' as const, from: `${e.id} source link` }] : []),
];

/**
 * Placeholder text whose copy key BACK-92 R7 removed with V1's unreachable restricted path (HOME_COPY.investigations.restrictedCount,
 * "<n> restricted to Technical"). It is kept here as a literal, as it rendered without the count, so a reintroduced placeholder still fails.
 */
const REMOVED_PLACEHOLDERS: Readonly<Record<Lang, string>> = { en: 'restricted to Technical', ar: 'مقيّدة للفريق التقني' };

/** The copy that stands in for a withheld record. A placeholder is itself a disclosure, so none of it may reach a lay persona. */
const placeholders = (): Token[] =>
  LANGS.flatMap((lang) => {
    const i = lang === 'ar' ? 1 : 0;
    const restrictedCount = REMOVED_PLACEHOLDERS[lang];
    return [
      { value: COPY[lang].restricted, kind: 'placeholder' as const, from: `COPY.${lang}.restricted` },
      { value: COPY[lang].notRead.restricted, kind: 'placeholder' as const, from: `COPY.${lang}.notRead.restricted` },
      { value: SHELL[lang].states.restricted.title, kind: 'placeholder' as const, from: `SHELL.${lang}.states.restricted.title` },
      { value: SHELL[lang].states.restricted.body, kind: 'placeholder' as const, from: `SHELL.${lang}.states.restricted.body` },
      { value: EVIDENCE_COPY[lang].restrictedBody, kind: 'placeholder' as const, from: `EVIDENCE.${lang}.restrictedBody` },
      { value: restrictedCount, kind: 'placeholder' as const, from: `HOME_COPY.${lang}.investigations.restrictedCount (removed, BACK-92 R7)` },
      { value: plain(TABLE['edge.restricted'][i]), kind: 'placeholder' as const, from: `TABLE['edge.restricted'] ${lang}` },
    ];
  });

const dedupe = (ts: readonly Token[]): Token[] => {
  const seen = new Set<string>();
  return ts.filter((t) => (seen.has(`${t.kind}|${t.value}`) ? false : (seen.add(`${t.kind}|${t.value}`), true)));
};

/** Everything that would disclose a withheld record, in both languages and every persona's wording. */
export const RESTRICTED_TOKENS: readonly Token[] = dedupe([
  ...RESTRICTED_IDS.map((id) => ({ value: id, kind: 'id' as const, from: id })),
  ...WITHHELD.flatMap((e) => [...titlesOf(e.id), ...recordFields(e)]),
  ...placeholders(),
]);

const ID_SHAPE = /[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g;
/**
 * Id-shaped tokens the fixtures and copy use for public things (DEC-DEMO-5, MSN-DEMO-5). A restricted id found inside one of these,
 * as the whole token, is that public id and not a leak: "O-5" inside "DEC-DEMO-5" names a decision, not observation O-5.
 */
export const PUBLIC_IDS: ReadonlySet<string> = new Set(
  JSON.stringify([DOMAIN, V1_WORLD, LENS_WORLD, COPY, TABLE, SHELL, HOME_COPY, EVIDENCE_COPY]).match(ID_SHAPE)!.filter((t) => !RESTRICTED_IDS.includes(t)),
);

export interface Leak {
  readonly token: string;
  readonly kind: TokenKind;
  readonly from: string;
  /** Which surface held it: visible text, hidden text, url, attr <tag>[name], value, comment. */
  readonly where: string;
  readonly context: string;
}

export interface LeakOptions {
  /** Check the withheld-record tokens (default true). Pass false for Technical, which may read them; extras still apply. */
  readonly restricted?: boolean;
  /** Spec-specific strings that must not appear either (case-insensitive substrings), such as BANNED job names and run ids. */
  readonly extra?: readonly string[];
  /** Ids matched as raw substrings, with no public-id exemption (what a spec that used String.includes checked). */
  readonly substring?: readonly string[];
  /** Strings removed from every surface before matching, such as the id a visitor typed into the address. */
  readonly ignore?: readonly string[];
}

interface Entry { readonly where: string; readonly text: string }

/** For each restricted id, the public ids that contain it and where: [public id, offset of the restricted id inside it]. */
const HOSTS: ReadonlyMap<string, ReadonlyArray<readonly [string, number]>> = new Map(
  RESTRICTED_IDS.map((id) => [id, [...PUBLIC_IDS].flatMap((p) => {
    const at: Array<readonly [string, number]> = [];
    for (let k = p.indexOf(id); k !== -1; k = p.indexOf(id, k + 1)) at.push([p, k]);
    return at;
  })]),
);

/**
 * Positions where `id` occurs as a leak. Every occurrence counts (a stricter rule than a whole-token match: "E-5" inside "xE-50" is
 * flagged) except one that lies inside a known public id spelled out in full at that place ("O-5" inside "DEC-DEMO-5"). With `raw`,
 * no occurrence is exempt: String.includes.
 */
function idHits(text: string, id: string, raw: boolean): number[] {
  const hits: number[] = [];
  const hosts = raw ? [] : (HOSTS.get(id) ?? []);
  for (let i = text.indexOf(id); i !== -1; i = text.indexOf(id, i + 1)) {
    if (!hosts.some(([p, k]) => i - k >= 0 && text.startsWith(p, i - k))) hits.push(i);
  }
  return hits;
}

const squash = (s: string): string => s.replace(/\s+/g, ' ');
const around = (text: string, i: number, n: number): string => squash(text.slice(Math.max(0, i - 30), i + n + 30)).trim();

/** The tokens a probe with these options checks. Exported so the superset checks in leaks.spec.ts can compare against old lists. */
export function tokensFor(opts: LeakOptions = {}): Token[] {
  return dedupe([
    ...(opts.restricted === false ? [] : RESTRICTED_TOKENS),
    ...(opts.extra ?? []).map((value) => ({ value, kind: 'extra' as const, from: 'extra' })),
    ...(opts.substring ?? []).filter((v) => opts.restricted === false || !RESTRICTED_IDS.includes(v)).map((value) => ({ value, kind: 'id' as const, from: 'substring' })),
  ]);
}

/** Matches the tokens against already-collected surfaces. */
export function findLeaks(entries: readonly Entry[], opts: LeakOptions = {}): Leak[] {
  const tokens = tokensFor(opts);
  const raw = new Set(opts.substring ?? []);
  const out: Leak[] = [];
  for (const { where, text: original } of entries) {
    let text = original;
    for (const g of opts.ignore ?? []) text = text.split(g).join('');
    const lower = text.toLowerCase();
    const flat = squash(lower);
    for (const t of tokens) {
      if (t.kind === 'id') {
        const [i] = idHits(text, t.value, raw.has(t.value));
        if (i !== undefined) out.push({ token: t.value, kind: t.kind, from: t.from, where, context: around(text, i, t.value.length) });
        continue;
      }
      const needle = squash(t.value.toLowerCase());
      const i = lower.indexOf(t.value.toLowerCase());
      if (i !== -1) out.push({ token: t.value, kind: t.kind, from: t.from, where, context: around(text, i, t.value.length) });
      else if (flat.includes(needle)) out.push({ token: t.value, kind: t.kind, from: t.from, where, context: around(flat, flat.indexOf(needle), needle.length) });
    }
  }
  return out;
}

/** The probe for a plain string (search results, a copied link). */
export const leaksIn = (text: string, opts: LeakOptions = {}): Leak[] => findLeaks([{ where: 'text', text }], opts);

/**
 * Every surface of the page (or of the elements matching `within`): visible text, hidden text including head and script text, the
 * address (raw and decoded), every attribute of every element (aria-*, title, alt, href, data-*, id, class, value...), the current
 * value of every form field, and comments. A superset of page.content(), which serializes the same text and attributes.
 */
export function surfaces(page: Page, within?: string): Promise<Entry[]> {
  return page.evaluate((sel) => {
    const out: { where: string; text: string }[] = [];
    const roots: Element[] = sel ? Array.from(document.querySelectorAll(sel)) : [document.documentElement];
    if (!sel) {
      out.push({ where: 'url', text: window.location.href });
      try { out.push({ where: 'url (decoded)', text: decodeURIComponent(window.location.href) }); } catch { /* malformed escape: the raw form is already scanned */ }
    }
    for (const root of roots) {
      const name = sel ? `${sel} ` : '';
      out.push({ where: `${name}visible text`, text: (sel ? (root as HTMLElement) : document.body).innerText ?? '' });
      out.push({ where: `${name}hidden text`, text: root.textContent ?? '' });
      for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
        const tag = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`;
        for (const a of Array.from(el.attributes)) out.push({ where: `${name}attr ${tag}[${a.name}]`, text: a.value });
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) out.push({ where: `${name}value ${tag}`, text: el.value });
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push({ where: `${name}comment`, text: n.nodeValue ?? '' });
    }
    return out;
  }, within ?? null);
}

/** Every leak on the page now. `[]` means no trace of a withheld record (or of an extra) on any surface. */
export async function leaks(page: Page, opts: LeakOptions & { readonly within?: string } = {}): Promise<Leak[]> {
  return findLeaks(await surfaces(page, opts.within), opts);
}

/** One line per leak, for an assertion message. */
export const explain = (ls: readonly Leak[]): string => ls.map((l) => `${l.token} (${l.from}) in ${l.where}: …${l.context}…`).join('\n');

/** Fails with every leak listed (token, origin, surface and context) when the page shows any trace of a withheld record or an extra. */
export async function expectNoLeaks(page: Page, label: string, opts: LeakOptions & { readonly within?: string } = {}): Promise<void> {
  const found = await leaks(page, opts);
  expect(found, `${label}\n${explain(found)}`).toEqual([]);
}

/** Positive control: true when the page shows `token` on any surface, by the rules the probe uses (Technical does read E-5). */
export async function shows(page: Page, token: string): Promise<boolean> {
  const restricted = RESTRICTED_TOKENS.some((t) => t.value === token);
  return (await leaks(page, restricted ? {} : { restricted: false, extra: [token] })).some((l) => l.token === token);
}
