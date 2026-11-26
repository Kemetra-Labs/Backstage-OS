// GitHub reads view (BACK-57) over the synthetic GET /portfolio fixture. The server side of the parity
// check is server/test/portfolio/portfolio-parity.spec.ts: it requires this fixture to equal what the
// server's read model produces.
import { describe, expect, it } from 'vitest';
import { parsePortfolio } from '../api/portfolio';
import PROJECT from '../fixture/portfolio-project-response.json';
import RESPONSE from '../fixture/portfolio-response.json';
import { FIXTURE_NOW, FORCED_FORMS, forcedBody, forcedFormFrom, githubReadView, githubReadViewFor } from './githubReadView';

const rows = (v = githubReadView()) => v.projects.flatMap((p) => p.sources);
const byRef = (ref: string, v = githubReadView()) => rows(v).find((s) => s.externalRef === ref)!;

describe('the synthetic GET /portfolio fixture', () => {
  it('parses completely: nothing malformed, nothing dropped (app half of the shape parity check)', () => {
    const parse = parsePortfolio(RESPONSE);
    expect(parse.malformed).toBe(false);
    expect(parse.dropped).toBe(0);
    expect(parse.projects.flatMap((p) => p.sources)).toHaveLength(6);
  });

  it('one project with items (GET /portfolio/:projectId, wrapped) parses every item', () => {
    const parse = parsePortfolio({ projects: [PROJECT] });
    expect(parse).toMatchObject({ malformed: false, dropped: 0 });
    const items = parse.projects[0]!.sources[0]!.items;
    expect(items.map((i) => `${i.kind}/${i.number}`)).toEqual(['pull_request/12', 'pull_request/14', 'issue/7']);
    expect(items.every((i) => i.evidenceId.length > 0 && i.title.startsWith('Demo '))).toBe(true);
    // Every pull request of the full page on the second source is kept too.
    expect(parse.projects[0]!.sources[1]!.items).toHaveLength(20);
  });
});

describe('githubReadView', () => {
  it('is always marked as demo data and is complete', () => {
    expect(githubReadView()).toMatchObject({ state: 'ok', demo: true, incomplete: false });
  });

  it('shows each read state from the fixture clock, never a health word', () => {
    expect(rows().map((s) => `${s.externalRef} ${s.status} ${s.failure}`)).toEqual([
      'kemetra-labs/demo-checkout current null',
      'kemetra-labs/demo-checkout-api current null',
      'kemetra-labs/demo-inventory stale null',
      'kemetra-labs/demo-inventory-sync notReadYet null',
      'kemetra-labs/demo-payments unavailable timeout',
      'kemetra-labs/demo-payments-ledger unavailable not_visible',
    ]);
  });

  it('a never-read source is "not read yet": no age, counts not read, never current', () => {
    const s = byRef('kemetra-labs/demo-inventory-sync');
    expect(s).toMatchObject({ status: 'notReadYet', ageMinutes: null });
    expect(s.pullRequests).toMatchObject({ kind: 'notRead' });
    expect(s.issues).toMatchObject({ kind: 'notRead' });
  });

  it('counts: exact for a short page, "at least" for a full one, not read for a failed read', () => {
    expect(byRef('kemetra-labs/demo-checkout').pullRequests).toMatchObject({ kind: 'exact', value: 2 });
    expect(byRef('kemetra-labs/demo-checkout-api').pullRequests).toMatchObject({ kind: 'atLeast', value: 20 });
    expect(byRef('kemetra-labs/demo-checkout-api').issues).toMatchObject({ kind: 'atLeast', value: 0 });
    expect(byRef('kemetra-labs/demo-payments').issues).toMatchObject({ kind: 'notRead' });
  });

  it('ages come from the injected clock, not the system time', () => {
    expect(byRef('kemetra-labs/demo-checkout').ageMinutes).toBe(10);
    const later = githubReadView(RESPONSE, new Date(FIXTURE_NOW.getTime() + 60 * 60_000));
    expect(byRef('kemetra-labs/demo-checkout', later)).toMatchObject({ status: 'stale', ageMinutes: 70 });
    const earlier = githubReadView(RESPONSE, new Date('2026-11-25T11:00:00.000Z'));
    // A read "in the future" has no age: unknown, never current.
    expect(byRef('kemetra-labs/demo-checkout', earlier)).toMatchObject({ status: 'unknown', ageMinutes: null });
  });

  it('an unknown failure code shows the generic failure, not the raw code', () => {
    const body = structuredClone(RESPONSE) as { projects: { sources: { reason: string | null }[] }[] };
    body.projects[2]!.sources[0]!.reason = 'something_new';
    expect(byRef('kemetra-labs/demo-payments', githubReadView(body)).failure).toBe('other');
  });

  it('a body that is not a portfolio shows nothing and says the view is incomplete, never an empty success', () => {
    expect(githubReadView({ nope: true })).toEqual({ projects: [], state: 'unreadable', demo: true, incomplete: true });
    const partial = { projects: [...RESPONSE.projects, { id: 'x' }] };
    expect(githubReadView(partial).incomplete).toBe(true);
  });
});

// BACK-62: a forced connector error appears as Unknown/Error in words, never as an empty or green panel. Every failure
// form is built in memory from the fixture; the fixture itself is pinned by the server parity test and never edited.
describe('forced connector errors (BACK-62)', () => {
  const HEALTH = /healthy|ok|green/i;
  const source = (state: string, reason: string | null) => {
    const body = structuredClone(RESPONSE) as { projects: { sources: { state: string; reason: string | null }[] }[] };
    body.projects[0]!.sources[0]!.state = state;
    body.projects[0]!.sources[0]!.reason = reason;
    return byRef('kemetra-labs/demo-checkout', githubReadView(body));
  };

  it.each([
    ['error', 'network', 'network'],
    ['error', null, 'malformed'],
    ['denied', 'denied', 'denied'],
    ['denied', 'not_visible', 'not_visible'],
    ['unknown', 'timeout', 'timeout'],
    ['unknown', 'rate_limited', 'rate_limited'],
  ] as const)('a source in %s (%s) is unavailable with a failure reason, no age and no count, even though its lists say ok', (state, reason, failure) => {
    const s = source(state, reason);
    expect(s).toMatchObject({ status: 'unavailable', failure, ageMinutes: null });
    expect(s.pullRequests).toMatchObject({ kind: 'notRead' });
    expect(s.issues).toMatchObject({ kind: 'notRead' });
    expect(s.status).not.toMatch(HEALTH);
  });

  it('an unknown state without a reason is unavailable, never "not read yet" and never current', () => {
    expect(source('unknown', null)).toMatchObject({ status: 'unavailable', failure: 'malformed' });
  });

  it('a malformed body is an unreadable panel, still marked demo data, with no row', () => {
    for (const body of [null, 'x', [], { projects: 'x' }, { projects: null }, { nope: true }]) {
      expect(githubReadView(body)).toEqual({ projects: [], state: 'unreadable', demo: true, incomplete: true });
    }
  });

  it('a body whose every project is dropped is unreadable, not empty', () => {
    expect(githubReadView({ projects: [{ id: 'x' }, 7] })).toMatchObject({ projects: [], state: 'unreadable', demo: true, incomplete: true });
  });

  it('a partly dropped body keeps its rows and says it is incomplete', () => {
    const v = githubReadView({ projects: [...RESPONSE.projects, { id: 'x' }] });
    expect(v).toMatchObject({ state: 'ok', demo: true, incomplete: true });
    expect(rows(v)).toHaveLength(6);
  });

  it('an empty project list is an explicit empty panel, still marked demo data, never a complete success', () => {
    expect(githubReadView({ projects: [] })).toEqual({ projects: [], state: 'empty', demo: true, incomplete: false });
  });

  it('a project with no source keeps the project and lists no row (the panel says nothing was read)', () => {
    const v = githubReadView({ projects: [{ ...RESPONSE.projects[0]!, sources: [] }] });
    expect(v).toMatchObject({ state: 'ok', demo: true });
    expect(v.projects[0]!.sources).toEqual([]);
  });

  it('every forced form is a failure in words: no current row, no count, the panel never ok and empty at once', () => {
    for (const form of FORCED_FORMS) {
      const v = githubReadView(forcedBody(form));
      expect(v.demo, form).toBe(true);
      expect(rows(v).filter((s) => s.status === 'current' || s.status === 'stale'), form).toEqual([]);
      expect(rows(v).filter((s) => s.pullRequests.kind !== 'notRead' || s.issues.kind !== 'notRead'), form).toEqual([]);
      if (v.state === 'ok') expect(rows(v).every((s) => s.status === 'unavailable' && s.failure !== null), form).toBe(true);
    }
    expect(githubReadView(forcedBody('malformed')).state).toBe('unreadable');
    expect(githubReadView(forcedBody('empty')).state).toBe('empty');
    expect(rows(githubReadView(forcedBody('error'))).map((s) => s.failure)).toEqual(Array(6).fill('network'));
    expect(rows(githubReadView(forcedBody('denied'))).map((s) => s.failure)).toEqual(Array(6).fill('denied'));
    expect(rows(githubReadView(forcedBody('timeout'))).map((s) => s.failure)).toEqual(Array(6).fill('timeout'));
  });

  it('forcing never edits the fixture', () => {
    const before = JSON.stringify(RESPONSE);
    for (const form of FORCED_FORMS) forcedBody(form);
    expect(JSON.stringify(RESPONSE)).toBe(before);
  });

  it('the review seed names a form; anything else shows the fixture', () => {
    expect(forcedFormFrom('?persona=owner&github=denied')).toBe('denied');
    for (const s of ['', '?github=', '?github=ok', '?github=healthy', '?github=ERROR']) expect(forcedFormFrom(s), s).toBeNull();
    expect(githubReadViewFor('?github=nope')).toEqual(githubReadView());
    expect(githubReadViewFor('?github=empty').state).toBe('empty');
  });
});
