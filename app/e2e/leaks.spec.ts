// BACK-92 R7: proof that the one non-disclosure probe (leaks.ts) replaces the per-spec banned lists without weakening any of them.
// BEFORE records, verbatim, what each spec checked before the migration: its tokens and how it matched them. Three things are proved:
// every old token is still checked (token superset), every string an old matcher flagged is still flagged (matcher dominance), and the
// probe reads every surface the old helpers read, and more, on a real page (surface coverage).
import { expect, test } from '@playwright/test';
import { DOMAIN } from '../src/domain/fixture';
import { COPY } from '../src/i18n/strings';
import { formatAge } from '../src/i18n/segments';
import { WORLD as LENS_WORLD } from '../src/lenses/fixtures/world';
import { BANNED, openRoute } from './helpers';
import { findLeaks, leaks, PUBLIC_IDS, RESTRICTED_IDS, RESTRICTED_TOKENS, tokensFor, WITHHELD, type LeakOptions } from './leaks';

type Matcher = (text: string, token: string) => boolean;
const includes: Matcher = (text, t) => text.includes(t);
const hasIdOrQuoted: Matcher = (text, t) => new RegExp(`(^|[^A-Za-z0-9-])${t}([^A-Za-z0-9-]|$)`).test(text) || text.includes(`"${t}"`);
const wordBoundary: Matcher = (text, t) => new RegExp(`\\b${t}\\b`).test(text);
const escapeRe = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regexExact: Matcher = (text, t) => new RegExp(escapeRe(t)).test(text);

/** The hand lists as they were before R7 (copied from the specs at 5a248b0), with the matcher each one used and the probe options that replace it. */
const BANNED_BEFORE = ['integration-tests', '#DEMO-4471', 'PR #DEMO-88', 'AssertionError', 'example.invalid', 'DEMO-4468', 'DEMO-5120', 'DEMO-311'];
const DOMAIN_WITHHELD = Object.values(DOMAIN.evidence).filter((e) => e.visibility === 'technical');
const LENS_RESTRICTED_BEFORE = [...DOMAIN_WITHHELD.map((e) => e.id), ...DOMAIN_WITHHELD.flatMap((e) => (e.observation ? [e.observation.id] : []))];
const e5Titles = (lang: 'en' | 'ar'): string[] => [...new Set((['owner', 'technical', 'nontechnical'] as const).map((p) => COPY[lang].evidenceItem['E-5']![p].replace(/[{}]/g, '')))];
const E5_AGE = LENS_WORLD.evidenceById['E-5']!.observation!.source.ageMinutes;

interface Before { readonly spec: string; readonly groups: ReadonlyArray<{ readonly tokens: readonly string[]; readonly match: Matcher }>; readonly opts: LeakOptions }
const BEFORE: readonly Before[] = [
  { spec: 'nondisclosure.spec.ts (forbidden(lang))', opts: { substring: ['E-5', 'E-12', 'E-23'] },
    groups: [{ tokens: ['E-5', 'E-12', 'E-23', 'Restricted to Technical', COPY.ar.restricted, COPY.en.restricted], match: includes }] },
  { spec: 'canonical-overlap.spec.ts (WITHHELD_IDS + WITHHELD_OBSERVATIONS)', opts: { substring: ['E-5', 'O-5'] },
    groups: [{ tokens: LENS_RESTRICTED_BEFORE, match: includes }] },
  ...['mission-map', 'mission-replay', 'source-observatory', 'agent-flight-deck', 'convergence'].map((s) => ({
    spec: `${s}.spec.ts (lens-helpers RESTRICTED, hasId or quoted)`, opts: {}, groups: [{ tokens: LENS_RESTRICTED_BEFORE, match: hasIdOrQuoted }],
  })),
  { spec: 'SourceObservatoryScope.test.ts / AgentFlightDeckScope.test.ts (lens-helpers leaks)', opts: {}, groups: [{ tokens: LENS_RESTRICTED_BEFORE, match: hasIdOrQuoted }] },
  { spec: 'mission-map.spec.ts (typed E-5 dropped)', opts: { substring: ['E-5'] }, groups: [{ tokens: ['E-5'], match: includes }] },
  { spec: 'lens-nondisclosure.spec.ts (E-5 and its titles)', opts: {}, groups: [{ tokens: ['E-5', ...e5Titles('en'), ...e5Titles('ar')], match: regexExact }] },
  ...(['en', 'ar'] as const).map((lang) => ({
    spec: `lens-nondisclosure.spec.ts (inspector age, ${lang})`, opts: { restricted: false, extra: [formatAge(E5_AGE, lang)] },
    groups: [{ tokens: [formatAge(E5_AGE, lang)], match: regexExact }],
  })),
  { spec: 'project-flow.spec.ts (page.content() privacy)', opts: { extra: BANNED },
    groups: [{ tokens: ['E-5', 'E-12'], match: wordBoundary }, { tokens: [...BANNED_BEFORE, 'Restricted to Technical'], match: includes }] },
  ...['home', 'portfolio', 'project', 'sources', 'agents', 'decisions', 'evidence', 'investigation-integration', 'flow'].map((s) => ({
    spec: `${s}.spec.ts (BANNED)`, opts: { extra: BANNED }, groups: [{ tokens: BANNED_BEFORE, match: includes }],
  })),
];

test('the fixture still holds the withheld records the old hand lists named', () => {
  expect(WITHHELD.map((e) => e.id)).toEqual(expect.arrayContaining(['E-5', 'E-12', 'E-23']));
  expect(RESTRICTED_IDS).toEqual(expect.arrayContaining(['E-5', 'E-12', 'E-23', 'O-5', 'O-12', 'O-23']));
  expect(BANNED).toEqual(BANNED_BEFORE);
});

for (const b of BEFORE) {
  test(`superset: ${b.spec} — every old token is still checked`, () => {
    const now = tokensFor(b.opts).map((t) => t.value.toLowerCase());
    for (const g of b.groups) for (const t of g.tokens) expect(now, t).toContain(t.toLowerCase());
  });

  test(`dominance: ${b.spec} — whatever the old matcher flagged, the probe flags`, () => {
    const pre = ['', 'a', 'Z', '0', '-', ' ', '"', '/', '#', '=', '>', 'ع', 'DEC-DEMO-', 'MSN-DEMO-', 'INV-DEMO-', 'DEM', 'RT-DEMO-11'];
    const post = ['', 'a', '0', '9', '-', ' ', '"', '/', '?', '<', 'ع', '120', 'Open'];
    for (const g of b.groups) {
      for (const t of g.tokens) {
        for (const p of pre) {
          for (const s of post) {
            const text = `x ${p}${t}${s} y`;
            if (!g.match(text, t)) continue;
            const found = findLeaks([{ where: 'text', text }], b.opts).some((l) => l.token.toLowerCase() === t.toLowerCase());
            expect(found, `${b.spec}: "${text}"`).toBe(true);
          }
        }
      }
    }
  });
}

test('the public-id exemption never touches a record id the old specs matched as a raw substring', () => {
  for (const id of ['E-5', 'E-12', 'E-23']) expect([...PUBLIC_IDS].filter((p) => p.includes(id)), id).toEqual([]);
  // It does apply to observation ids inside public ids ("O-5" in DEC-DEMO-5), which is why canonical-overlap keeps them raw.
  expect([...PUBLIC_IDS].filter((p) => p.includes('O-5'))).toEqual(expect.arrayContaining(['DEC-DEMO-5', 'MSN-DEMO-5']));
});

test('the probe reads every surface the old helpers read, and more, on a real page', async ({ page }) => {
  await openRoute(page, '/', { persona: 'owner' });
  expect(await leaks(page), 'the owner home page is clean before the plant').toEqual([]);
  const title = RESTRICTED_TOKENS.find((t) => t.kind === 'title')!.value;
  const placeholder = RESTRICTED_TOKENS.find((t) => t.kind === 'placeholder')!.value;
  await page.evaluate(({ title: ti, placeholder: pl }) => {
    const add = (html: string) => document.body.insertAdjacentHTML('beforeend', html);
    add('<span aria-label="row E-5">x</span>');
    add(`<span title="${ti}">x</span>`);
    add('<img alt="O-5" src="data:,">');
    add('<a href="#/evidence/E-12">x</a>');
    add('<i data-evidence="E-23"></i>');
    add(`<div hidden>${ti}</div>`);
    add(`<p>${pl}</p>`);
    add('<input placeholder="O-12">');
    add('<span class="ev-O-23"></span>');
    add('<!-- E-5 -->');
    const input = document.createElement('input');
    input.value = 'E-12';
    document.body.append(input);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/evidence/E-23`);
  }, { title, placeholder });
  const where = (await leaks(page)).map((l) => `${l.token} @ ${l.where}`);
  for (const expected of [
    'E-5 @ attr span[aria-label]', `${title} @ attr span[title]`, 'O-5 @ attr img[alt]', 'E-12 @ attr a[href]', 'E-23 @ attr i[data-evidence]',
    `${title} @ hidden text`, `${placeholder} @ visible text`, 'O-12 @ attr input[placeholder]', 'O-23 @ attr span[class]', 'E-5 @ comment',
    'E-12 @ value input', 'E-23 @ url',
  ]) expect(where, expected).toContain(expected);
  expect(where).not.toContain(`${title} @ visible text`); // hidden really is hidden: the probe tells the two apart
});
