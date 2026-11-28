// BACK-148 (decision L): what the "Project observations, not part of this case" list says, in English and Arabic. Rendered to static
// markup (node environment); the view is prop-driven. The count is honest: a full answer is a lower bound of what is shown.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppContext, type AppState } from '../../app/AppContext';
import { hostCopy } from '../../i18n/host';
import { EVIDENCE_LIST_LIMIT, type ProjectObservationsView, type RecordRow } from '../../view/investigationReadView';
import { ProjectObservations } from './ServerRecords';

const ROW = (i: number, over: Partial<RecordRow> = {}): RecordRow => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  label: 'observed',
  read: 'current',
  reason: null,
  ageMinutes: 5,
  sourceRef: null,
  ...over,
});

const VIEW = (over: Partial<ProjectObservationsView> = {}): ProjectObservationsView => ({ state: 'ok', rows: [], atLeast: false, incomplete: false, demo: false, ...over });

function render(view: ProjectObservationsView, lang: 'en' | 'ar' = 'en'): string {
  const app = { lang, shell: hostCopy('SHELL', lang), copy: hostCopy('COPY', lang) } as unknown as AppState;
  return renderToStaticMarkup(createElement(AppContext.Provider, { value: app }, createElement(ProjectObservations, { view })));
}
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('project observations list (BACK-148)', () => {
  it('a full answer says "at least" the number shown, which can be below the cap (the case\'s own rows are listed with the case)', () => {
    const rows = Array.from({ length: EVIDENCE_LIST_LIMIT - 1 }, (_, i) => ROW(i + 1));
    const html = render(VIEW({ rows, atLeast: true }));
    expect(html).toContain('data-at-least="true"');
    expect(text(html)).toContain(`At least ${EVIDENCE_LIST_LIMIT - 1}:`);
    expect(text(html)).toContain(`newest ${EVIDENCE_LIST_LIMIT} observations`);
    expect(text(html)).not.toContain(`At least ${EVIDENCE_LIST_LIMIT}:`);
    expect(html.match(/data-testid="project-observation"/g)).toHaveLength(EVIDENCE_LIST_LIMIT - 1);
    const ar = text(render(VIEW({ rows, atLeast: true }), 'ar'));
    expect(ar).toContain(`${EVIDENCE_LIST_LIMIT - 1} على الأقل`);
  });

  it('a list under the cap gives the plain count', () => {
    const html = render(VIEW({ rows: [ROW(1), ROW(2, { read: 'stale' })] }));
    expect(html).toContain('data-at-least="false"');
    expect(text(html)).toContain('2 listed');
  });

  it('none listed is not "nothing wrong"; an unreadable list is not "none"', () => {
    expect(text(render(VIEW()))).toContain('That is not the same as nothing being wrong.');
    const bad = text(render(VIEW({ state: 'unreadable' })));
    expect(bad).toContain('could not be read');
    expect(bad).not.toContain('listed');
  });

  it('each row says it is not part of this case; an unknown read is never current', () => {
    const html = render(VIEW({ rows: [ROW(1, { label: 'unknown', read: 'notRead', reason: 'unknown', ageMinutes: null })] }));
    expect(text(html)).toContain('Not part of this case');
    expect(html).toContain('data-read="notRead"');
    expect(html).not.toContain('data-read="current"');
  });
});
