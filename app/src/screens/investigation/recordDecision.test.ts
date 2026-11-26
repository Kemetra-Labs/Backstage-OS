// BACK-51 P3: what the decision form says in each state, in English and Arabic. Rendered to static markup (node environment): the
// view is prop-driven, so this holds whatever the build's live switch is.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppContext, type AppState } from '../../app/AppContext';
import { isForbiddenControlLabel } from '../../contract/rules';
import { hostCopy } from '../../i18n/host';
import { EMPTY_DRAFT, type DecisionDraft } from '../../live/decisions';
import type { SessionStatus } from '../../live/session';
import type { RecordRow } from '../../view/investigationReadView';
import { RecordDecisionView, type FormResult, type RecordDecisionViewProps } from './RecordDecision';

const REC = (i: number, over: Partial<RecordRow> = {}): RecordRow => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  label: 'hypothesis',
  read: 'current',
  reason: null,
  ageMinutes: 12,
  sourceRef: null,
  ...over,
});

function render(over: Partial<RecordDecisionViewProps> = {}, lang: 'en' | 'ar' = 'en'): string {
  const app = { lang, shell: hostCopy('SHELL', lang), copy: hostCopy('COPY', lang) } as unknown as AppState;
  const props: RecordDecisionViewProps = {
    draft: EMPTY_DRAFT,
    records: [],
    technical: false,
    sessionStatus: 'signedIn',
    submitting: false,
    showProblems: false,
    result: null,
    onChange: () => undefined,
    onSubmit: () => undefined,
    ...over,
  };
  return renderToStaticMarkup(createElement(AppContext.Provider, { value: app }, createElement(RecordDecisionView, props)));
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const GOOD: DecisionDraft = { decision: 'Revert pull request #42', rationale: 'Failures began after it merged.', evidenceIds: [] };
const RESULTS: readonly FormResult[] = ['recorded', 'invalid', 'not_found', 'rate_limited', 'unavailable', 'error', 'citationsChanged'];
const SESSIONS: readonly SessionStatus[] = ['checking', 'signedIn', 'signedOut', 'ended', 'unavailable', 'error'];

describe('RecordDecisionView', () => {
  it('idle: two labelled fields with code-unit counters, and an enabled submit', () => {
    const html = render();
    expect(text(html)).toContain('Record a decision');
    expect(html).toMatch(/<label[^>]*for="rd-decision"[^>]*>Decision<\/label>/);
    expect(html).toMatch(/<label[^>]*for="rd-rationale"[^>]*>Rationale<\/label>/);
    expect(html).toContain('<textarea id="rd-decision"');
    expect(text(html)).toContain('0 / 2000');
    expect(text(html)).toContain('0 / 4000');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Record decision<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });

  it('counts UTF-16 code units: an emoji is two, as on the server', () => {
    expect(text(render({ draft: { ...GOOD, decision: '😀' } }))).toContain('2 / 2000');
    expect(text(render({ draft: { ...GOOD, rationale: 'ع'.repeat(3) } }))).toContain('3 / 4000');
  });

  it('keeps the typed text in the fields', () => {
    const html = render({ draft: GOOD });
    expect(html).toContain('Revert pull request #42</textarea>');
    expect(html).toContain('Failures began after it merged.</textarea>');
  });

  it('names blank fields only after a submit attempt, and always names a limit that is broken', () => {
    expect(text(render())).not.toContain('Write the decision.');
    const tried = render({ showProblems: true });
    expect(text(tried)).toContain('Write the decision.');
    expect(text(tried)).toContain('Write the rationale.');
    expect(tried).toContain('aria-invalid="true"');
    const long = render({ draft: { ...GOOD, decision: 'x'.repeat(2001) } });
    expect(text(long)).toContain('The decision is too long. The limit is 2000 characters.');
    expect(render({ draft: GOOD })).not.toContain('aria-invalid="true"');
  });

  it('while not signed in the draft stays and submit is off, with the reason in words', () => {
    for (const s of ['checking', 'signedOut', 'ended', 'unavailable', 'error'] as const) {
      const html = render({ draft: GOOD, sessionStatus: s });
      expect(html, s).toMatch(/<button[^>]*disabled[^>]*>Record decision<\/button>/);
      expect(html, s).toContain('Revert pull request #42</textarea>');
      expect(text(html), s).toMatch(/draft is kept|Checking your session/);
    }
    expect(text(render({ sessionStatus: 'ended' }))).toContain('Your session ended');
    expect(text(render({ sessionStatus: 'signedIn' }))).not.toContain('draft is kept');
  });

  it('while submitting: disabled, busy, and says so; the fields cannot change under the request in flight', () => {
    const html = render({ draft: GOOD, submitting: true, records: [REC(1)] });
    expect(html.match(/readOnly=""/g)).toHaveLength(2);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Recording…<\/button>/);
    expect(html).toContain('aria-busy="true"');
  });

  it('each result says what happened and what is kept; only recorded is a plain status', () => {
    const t = (r: FormResult) => text(render({ draft: GOOD, result: r }));
    expect(t('recorded')).toContain('Decision recorded');
    expect(t('invalid')).toContain('The server did not accept this decision');
    expect(t('not_found')).toContain('This case or a cited record is not visible');
    expect(t('citationsChanged')).toContain('A cited record is no longer listed');
    expect(t('citationsChanged')).toContain('Nothing was sent.');
    expect(t('rate_limited')).toContain('Too many requests');
    expect(t('unavailable')).toContain('Not confirmed');
    expect(t('error')).toContain('The server answered with an error');
    for (const r of RESULTS.filter((x) => x !== 'recorded')) expect(t(r), r).toContain('Your draft is kept.');
    expect(render({ result: 'recorded' })).toContain('role="status"');
    for (const r of RESULTS.filter((x) => x !== 'recorded')) expect(render({ result: r }), r).toContain('role="alert"');
  });

  it('an unconfirmed send or a server error tells the owner to check the decision list before retrying', () => {
    expect(text(render({ result: 'unavailable' }))).toContain('Check the decision list before trying again');
    expect(text(render({ result: 'error' }))).toContain('check the decision list before trying again');
  });

  it('a hidden case reveals nothing: not_found names no id and does not say it exists', () => {
    const t = text(render({ result: 'not_found' }));
    expect(t).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(t).toContain('It may not exist, or this session may not see it.');
  });

  it('never says Approved (English): a recorded decision is recorded, nothing more', () => {
    for (const lang of ['en'] as const) for (const r of [null, ...RESULTS]) expect(render({ result: r }, lang), String(r)).not.toMatch(/\bApproved\b/);
  });

  it('the picker lists each record once with its label, a position and no id; Technical also sees the source reference', () => {
    const records = [REC(1, { sourceRef: 'github:example-org/demo-storefront#pull/42' }), REC(2, { label: 'unknown', read: 'notRead', reason: 'noSource', ageMinutes: null })];
    const owner = render({ records });
    expect(owner.match(/type="checkbox"/g)).toHaveLength(2);
    expect(text(owner)).toContain('Record 1');
    expect(text(owner)).toContain('Record 2');
    expect(owner).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(owner).not.toContain('github:example-org');
    const tech = render({ records, technical: true });
    expect(tech).toContain('github:example-org/demo-storefront#pull/42');
  });

  it('the picker checks the cited records, and says so when there is nothing to cite', () => {
    const records = [REC(1), REC(2)];
    const html = render({ records, draft: { ...GOOD, evidenceIds: [records[1]!.id] } });
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(text(render())).toContain('No record is listed to cite.');
  });

  it('Arabic: every state has its own copy and no English is left (only the {Kawalys}-style tokens may stay Latin)', () => {
    const states: Partial<RecordDecisionViewProps>[] = [
      {},
      { showProblems: true },
      { submitting: true, draft: { decision: 'التراجع عن التغيير', rationale: 'بدأت الأعطال بعده', evidenceIds: [] } },
      { records: [REC(1), REC(2)] },
      ...SESSIONS.map((s) => ({ sessionStatus: s })),
      ...RESULTS.map((r) => ({ result: r })),
    ];
    for (const over of states) {
      const ar = text(render(over, 'ar')).replace(/[0-9\s/]+/g, ' ');
      expect(ar, JSON.stringify(over)).not.toMatch(/[A-Za-z]{2,}/);
      expect(ar, JSON.stringify(over)).toContain('تسجيل');
    }
    expect(render({}, 'ar')).toContain('>القرار</label>');
  });
});

describe('record decision control labels', () => {
  it('carry no forbidden action verb (a decision is recorded, never approved or run)', () => {
    for (const lang of ['en', 'ar'] as const) {
      const c = hostCopy('INVESTIGATION', lang).recordDecision;
      for (const label of [c.submit, c.submitting, c.decisionLabel, c.rationaleLabel, c.evidenceLegend, c.title]) expect(isForbiddenControlLabel(label), `${lang}: ${label}`).toBe(false);
    }
  });
});
