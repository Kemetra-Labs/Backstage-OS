// GitHub reads view (BACK-57) over the synthetic GET /portfolio fixture. The server side of the parity
// check is server/test/portfolio/portfolio-parity.spec.ts: it requires this fixture to equal what the
// server's read model produces.
import { describe, expect, it } from 'vitest';
import { parsePortfolio } from '../api/portfolio';
import PROJECT from '../fixture/portfolio-project-response.json';
import RESPONSE from '../fixture/portfolio-response.json';
import { FIXTURE_NOW, githubReadView } from './githubReadView';

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
    expect(githubReadView()).toMatchObject({ demo: true, incomplete: false });
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
    expect(githubReadView({ nope: true })).toEqual({ projects: [], demo: false, incomplete: true });
    const partial = { projects: [...RESPONSE.projects, { id: 'x' }] };
    expect(githubReadView(partial).incomplete).toBe(true);
  });
});
