// BACK-62: an evidence list never renders as a blank panel, and a stale or unread row never looks current.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppContext, type AppState } from '../app/AppContext';
import type { Freshness, Lang } from '../contract/types';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { COPY } from '../i18n/strings';
import { SHELL } from '../i18n/shell';
import { viewFor } from '../view/viewFor';
import { EvidenceList, evidenceRowClass } from './EvidenceList';

const state = (lang: Lang): AppState =>
  ({ persona: 'technical', lang, copy: COPY[lang], shell: SHELL[lang] }) as unknown as AppState;

const render = (lang: Lang, items: Parameters<typeof EvidenceList>[0]['items']) =>
  renderToStaticMarkup(
    h(AppContext.Provider, { value: state(lang) },
      h(EvidenceList, { items, persona: 'technical', labelStyle: 'standard', copy: COPY[lang], lang, onOpen: () => {} })),
  );

describe('evidenceRowClass (BACK-62)', () => {
  const FRESH: readonly Freshness[] = ['current', 'stale', 'unknown'];

  it('marks every freshness with its own class', () => {
    for (const f of FRESH) expect(evidenceRowClass({ freshness: f })).toBe(`evidence-item fresh-${f}`);
  });

  it('keeps not-read and adds the freshness class, so an unread row is never styled current', () => {
    const cls = evidenceRowClass({ freshness: 'unknown', notReadReason: 'unavailable' });
    expect(cls.split(' ')).toEqual(['evidence-item', 'not-read', 'fresh-unknown']);
  });

  it('gives stale and current rows different classes', () => {
    expect(evidenceRowClass({ freshness: 'stale' })).not.toBe(evidenceRowClass({ freshness: 'current' }));
  });
});

describe('EvidenceList empty state (BACK-62)', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`says "no evidence yet" in words (${lang}), never an empty list`, () => {
      const html = render(lang, []);
      expect(html).toContain('data-state="empty"');
      expect(html).toContain(COPY[lang].noEvidence.title);
      expect(html).not.toContain('<ul class="evidence-list"></ul>');
    });
  }

  it('renders rows, not the empty state, when there is evidence, each with its freshness', () => {
    const items = viewFor('technical', INV_DEMO_7).evidence;
    expect(items.length).toBeGreaterThan(0);
    const html = render('en', items);
    expect(html).not.toContain('data-state="empty"');
    for (const e of items) expect(html).toContain(`data-evidence="${e.id}" data-freshness="${e.freshness}"`);
  });

  it('the demo case has a stale row and it is styled stale', () => {
    const items = viewFor('technical', INV_DEMO_7).evidence;
    const stale = items.filter((e) => e.freshness === 'stale');
    expect(stale.length).toBeGreaterThan(0);
    const html = render('en', items);
    for (const e of stale) expect(html).toMatch(new RegExp(`class="[^"]*fresh-stale[^"]*" data-evidence="${e.id}"`));
  });
});
