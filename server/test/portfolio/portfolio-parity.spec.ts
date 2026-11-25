// Response-shape parity with the app (BACK-57, owner decision 2026-11-25, Jira comment 18848): the shapes
// stay duplicated in server/ and app/, and this test keeps them in step. It builds a `GET /portfolio` body
// through the real read model (summarizeSource / summarizeProject, items dropped as the list route does)
// and requires it to equal the synthetic body the app renders, app/src/fixture/portfolio-response.json, and
// the same for one project WITH items (`GET /portfolio/:projectId`), app/src/fixture/portfolio-project-response.json.
// The app side (app/src/view/githubReadView.test.ts) requires that same file to parse with nothing
// malformed or dropped. No database. Regenerate the file after an intended model change with
// KAWALYS_WRITE_PORTFOLIO_FIXTURE=1.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarizeProject, summarizeSource, type BatchRow, type ProjectRef, type SourceRef } from '../../src/portfolio/portfolio.model';

// Jest runs from server/ (npm test, CI); from the repo root the app folder is a sibling of the cwd's child.
const ROOT = existsSync(join(process.cwd(), '..', 'app')) ? join(process.cwd(), '..') : process.cwd();
const fixture = (name: string) => join(ROOT, 'app', 'src', 'fixture', name);
const LIST_FIXTURE = fixture('portfolio-response.json');
const PROJECT_FIXTURE = fixture('portfolio-project-response.json');

let n = 0;
const at = (time: string) => `2026-11-25T${time}:00.000Z`;
const repo = (externalRef: string, time: string) => (state: BatchRow['state'], payload: Record<string, unknown>, suffix = ''): BatchRow => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  state,
  sourceRef: `github:${externalRef}${suffix}`,
  observedAt: at(time),
  payload,
});

/** One successful read: the repository, then each list's page record and its items. */
function okRead(externalRef: string, time: string, prs: number[], issues: number[], pageReturned?: { prs: number; issues: number }): BatchRow[] {
  const r = repo(externalRef, time);
  const item = (kind: 'pull_request' | 'issue', num: number) =>
    r('ok', { kind, number: num, title: `Demo ${kind} ${num}`, state: 'open', draft: kind === 'pull_request' ? false : null, updatedAt: at(time), url: null }, `#${kind}/${num}`);
  return [
    r('ok', { kind: 'repository', fullName: externalRef, defaultBranch: 'main', archived: false, private: true, pushedAt: null }),
    r('ok', { kind: 'list_page', endpoint: 'pull_requests', returned: pageReturned?.prs ?? prs.length, pageSize: 20 }),
    ...prs.map((num) => item('pull_request', num)),
    r('ok', { kind: 'list_page', endpoint: 'issues', returned: pageReturned?.issues ?? issues.length, pageSize: 20 }),
    ...issues.map((num) => item('issue', num)),
  ];
}

const failedRead = (externalRef: string, time: string, state: BatchRow['state'], reason: string): BatchRow[] => [
  repo(externalRef, time)(state, { kind: 'source_status', endpoint: 'repository', reason }),
];

const src = (id: number, externalRef: string): SourceRef => ({ id: `00000000-0000-4000-8000-0000000000b${id}`, provider: 'github', externalRef });
const project = (id: number, key: string, name: string): ProjectRef => ({ id: `00000000-0000-4000-8000-0000000000a${id}`, key, name });

/** Synthetic: kemetra-labs/demo-* repositories, read relative to the app's fixture clock 2026-11-25T12:00Z. */
function portfolioProjects(withItems: boolean) {
  n = 0; // deterministic row ids, whatever the test order
  const fullPage = Array.from({ length: 20 }, (_, i) => i + 1);
  const projects: [ProjectRef, [SourceRef, BatchRow[]][]][] = [
    [project(1, 'demo-checkout', 'Demo Checkout'), [
      [src(1, 'kemetra-labs/demo-checkout'), okRead('kemetra-labs/demo-checkout', '11:50', [12, 14], [7])],
      // Full pages: the counts are lower bounds ("at least").
      [src(2, 'kemetra-labs/demo-checkout-api'), okRead('kemetra-labs/demo-checkout-api', '11:45', fullPage, [], { prs: 20, issues: 20 })],
    ]],
    [project(2, 'demo-inventory', 'Demo Inventory'), [
      [src(3, 'kemetra-labs/demo-inventory'), okRead('kemetra-labs/demo-inventory', '08:00', [3], [])],
      [src(4, 'kemetra-labs/demo-inventory-sync'), []],
    ]],
    [project(3, 'demo-payments', 'Demo Payments'), [
      [src(5, 'kemetra-labs/demo-payments'), failedRead('kemetra-labs/demo-payments', '11:55', 'unknown', 'timeout')],
      [src(6, 'kemetra-labs/demo-payments-ledger'), failedRead('kemetra-labs/demo-payments-ledger', '11:55', 'denied', 'not_visible')],
    ]],
  ];
  // Projects ordered by key, as the repository returns them; the list route drops every source's items.
  return projects.map(([p, sources]) =>
    summarizeProject(p, sources.map(([s, batch]) => {
      const summary = summarizeSource(s, batch);
      return withItems ? summary : { ...summary, items: [] };
    })),
  );
}

const json = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
/** GET /portfolio: { projects }, no items. */
const portfolioBody = () => json({ projects: portfolioProjects(false) });
/** GET /portfolio/:projectId for Demo Checkout: the project itself, with items. */
const projectBody = () => json(portfolioProjects(true)[0]);

function matchesFixture(path: string, body: unknown): void {
  if (process.env['KAWALYS_WRITE_PORTFOLIO_FIXTURE'] === '1') writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(body);
}

describe('GET /portfolio response parity with the app fixture', () => {
  it('the app renders exactly what the server read model produces', () => {
    matchesFixture(LIST_FIXTURE, portfolioBody());
  });

  it('one project with items (GET /portfolio/:projectId) also matches, so the item shape is covered', () => {
    const body = projectBody() as { sources: { items: unknown[] }[] };
    expect(body.sources[0]!.items).toHaveLength(3);
    matchesFixture(PROJECT_FIXTURE, body);
  });

  it('covers every state the screen must show: current, at least, stale, never read, failed and denied', () => {
    const sources = (portfolioBody() as { projects: { sources: { state: string; reason: string | null; lists: { pullRequests: { complete: boolean | null } } }[] }[] }).projects.flatMap((p) => p.sources);
    expect(sources.map((s) => `${s.state}/${s.reason}`)).toEqual(['ok/null', 'ok/null', 'ok/null', 'unknown/never_read', 'unknown/timeout', 'denied/not_visible']);
    expect(sources[1]!.lists.pullRequests.complete).toBe(false);
  });
});
