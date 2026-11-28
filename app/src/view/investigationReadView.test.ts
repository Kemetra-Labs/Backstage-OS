// Server-shaped evidence view (BACK-57) over the synthetic GET /investigations/:id and GET /decisions fixtures. The server side
// of the parity check is server/test/evidence/evidence-parity.spec.ts: it requires these fixtures to equal what the server's
// repositories produce. Failure inputs are built here; the fixtures themselves are never edited.
import { describe, expect, it } from 'vitest';
import DECISIONS from '../fixture/decisions-response.json';
import INVESTIGATION from '../fixture/investigation-response.json';
import PROJECT_OBSERVATIONS from '../fixture/project-observations-response.json';
import { EVIDENCE_LIST_LIMIT, FIXTURE_NOW, investigationReadView, projectObservationsView } from './investigationReadView';

const CORRELATION = '00000000-0000-4000-8000-000000000001';
const DECISION = '00000000-0000-4000-8000-000000000005';
const FAILED_RUN = '00000000-0000-4000-8000-000000000007';

const view = (persona: 'owner' | 'technical' = 'technical', body: unknown = INVESTIGATION, decisions: unknown = DECISIONS, now = FIXTURE_NOW) =>
  investigationReadView(persona, body, decisions, now)!;
const row = (id: string, v = view()) => v.records.find((r) => r.id === id)!;
type Body = { evidence: Record<string, unknown>[] };
const withRecord = (id: string, over: Record<string, unknown>) => {
  const body = structuredClone(INVESTIGATION) as unknown as Body;
  Object.assign(body.evidence.find((r) => r['id'] === id)!, over);
  return body;
};

describe('the synthetic investigation and decisions fixtures', () => {
  it('every record is parsed: two source records, one decision, nothing left out, always demo data', () => {
    const v = view();
    expect(v).toMatchObject({ state: 'ok', incomplete: false, demo: true });
    expect(v.records.map((r) => r.id)).toEqual([CORRELATION, FAILED_RUN]);
    expect(v.decisions.map((d) => d.id)).toEqual([DECISION]);
    expect(v.records.length + v.decisions.length).toBe(INVESTIGATION.evidence.length);
  });

  it('the correlation has no written rule, so its badge is a hypothesis; it is 40 min old against a 30 min TTL, so stale', () => {
    expect(row(CORRELATION)).toEqual({
      id: CORRELATION, label: 'hypothesis', read: 'stale', reason: null, ageMinutes: 40,
      sourceRef: 'github:example-org/demo-storefront#pull/42',
    });
  });

  it('the failed read stays not read with its reason: unknown badge, no age, never current', () => {
    expect(row(FAILED_RUN)).toEqual({
      id: FAILED_RUN, label: 'unknown', read: 'notRead', reason: 'error', ageMinutes: null,
      sourceRef: 'github:example-org/demo-storefront#actions/runs/1002',
    });
  });

  it('the decision is proposed, cites evidence but has no owning link, and its creator is recorded', () => {
    expect(view().decisions[0]).toEqual({
      id: DECISION, label: 'proposed', creator: 'recorded', ageMinutes: 0,
      text: 'Revert pull request #42 on main and re-run checkout-e2e',
      cites: [{ id: CORRELATION, where: 'case', row: row(CORRELATION) }, { id: FAILED_RUN, where: 'case', row: row(FAILED_RUN) }],
    });
  });

  it('never says healthy: no row carries a health word', () => {
    const v = view();
    expect(JSON.stringify([v.records, v.decisions])).not.toMatch(/health|"ok"/i);
  });
});

describe('persona scoping', () => {
  it('Nontechnical gets no panel at all', () => {
    expect(investigationReadView('nontechnical')).toBeNull();
  });

  it('Owner gets types, read states, ages and decisions, but no source reference and no server free text', () => {
    const owner = view('owner');
    const technical = view('technical');
    expect(owner.records.map((r) => r.sourceRef)).toEqual([null, null]);
    expect(owner.decisions.map((d) => d.text)).toEqual([null]);
    expect(owner.records.map(({ sourceRef: _s, ...r }) => r)).toEqual(technical.records.map(({ sourceRef: _s, ...r }) => r));
    expect(owner.decisions[0]).toMatchObject({ label: 'proposed', creator: 'recorded' });
    expect(JSON.stringify(owner)).not.toMatch(/#42|checkout-e2e|example-org|actions\/runs/);
  });
});

describe('read states stay honest', () => {
  it('ages and freshness come from the injected clock: 10 min after the read the correlation is current, never before it', () => {
    expect(row(CORRELATION, view('technical', INVESTIGATION, DECISIONS, new Date('2026-11-25T11:30:00.000Z')))).toMatchObject({
      read: 'unknown', ageMinutes: 10,
    });
    const body = withRecord(CORRELATION, { receivedAt: '2026-11-25T11:20:00.000Z' });
    expect(row(CORRELATION, view('technical', body, DECISIONS, new Date('2026-11-25T11:30:00.000Z')))).toMatchObject({ read: 'current', ageMinutes: 10 });
  });

  it('a record dated in the future is unknown with no age, never current', () => {
    expect(row(CORRELATION, view('technical', withRecord(CORRELATION, { observedAt: '2026-11-25T13:00:00.000Z' })))).toMatchObject({ read: 'unknown', ageMinutes: null });
  });

  it.each(['error', 'denied', 'unknown'] as const)('a record in %s is not read, with that reason', (state) => {
    expect(row(CORRELATION, view('technical', withRecord(CORRELATION, { state })))).toMatchObject({ label: 'unknown', read: 'notRead', reason: state, ageMinutes: null });
  });

  it('a server stale record stays stale', () => {
    expect(row(CORRELATION, view('technical', withRecord(CORRELATION, { state: 'stale', observedAt: '2026-11-25T11:59:00.000Z' })))).toMatchObject({ read: 'stale' });
  });

  it('a record from a source with no read authority stays unread ("noSource"), never invented', () => {
    expect(row(CORRELATION, view('technical', withRecord(CORRELATION, { sourceRef: 'jira:DEMO-1' })))).toMatchObject({ read: 'notRead', reason: 'noSource' });
    expect(row(CORRELATION, view('technical', withRecord(CORRELATION, { sourceId: null })))).toMatchObject({ read: 'notRead', reason: 'noSource' });
  });

  it('an Observation read in time is observed and current', () => {
    const body = withRecord(FAILED_RUN, { state: 'ok', observedAt: '2026-11-25T11:50:00.000Z' });
    expect(row(FAILED_RUN, view('technical', body))).toMatchObject({ label: 'observed', read: 'current', ageMinutes: 10 });
  });
});

describe('decisions are never approved without their owning link', () => {
  // The approved case (citations AND an https github.com link) is pinned on the adapter in src/api/evidence.test.ts; this file
  // holds no URL literal, so the boundary guard's request scan stays strict for the approved importers.
  it('a decision whose owning link is not a followable https github.com link stays proposed, whatever it cites', () => {
    for (const url of ['github.com/example-org/demo-storefront/pull/43', 'ftp:github.com/x', '', 42]) {
      const body = withRecord(DECISION, { payload: { decision: 'x', url } });
      expect(view('technical', body).decisions[0]!.label, String(url)).toBe('proposed');
    }
    expect(view('technical', withRecord(DECISION, { citations: [] })).decisions[0]!.label).toBe('proposed');
  });

  it('a GET /decisions item alone is proposed (the record shape has no link), and a missing creator says so', () => {
    const body = { ...INVESTIGATION, evidence: INVESTIGATION.evidence.filter((r) => r.type !== 'HumanDecision') };
    const items = [{ ...DECISIONS.items[0]!, createdBy: null }];
    expect(view('technical', body, { items, nextCursor: null }).decisions).toEqual([
      {
        id: DECISION, label: 'proposed', creator: 'notRecorded', ageMinutes: 0, text: 'Revert pull request #42 on main and re-run checkout-e2e',
        cites: [{ id: CORRELATION, where: 'case', row: row(CORRELATION) }, { id: FAILED_RUN, where: 'case', row: row(FAILED_RUN) }],
      },
    ]);
  });

  it('a decision in the investigation with no GET /decisions item is proposed with its creator not recorded', () => {
    expect(view('technical', INVESTIGATION, { items: [], nextCursor: null }).decisions[0]).toMatchObject({ label: 'proposed', creator: 'notRecorded' });
  });

  it('decisions of another investigation are not shown', () => {
    const body = { ...INVESTIGATION, evidence: INVESTIGATION.evidence.filter((r) => r.type !== 'HumanDecision') };
    expect(view('technical', body, { items: [{ ...DECISIONS.items[0]!, investigationId: 'other' }], nextCursor: null }).decisions).toEqual([]);
  });
});

describe('failure forms are said in words, never as an empty success', () => {
  it.each([null, 'x', [], {}, { id: 'i' }, { evidence: [] }, { id: 'i', evidence: 'x' }])('a malformed investigation body (%j) is unreadable', (body) => {
    for (const persona of ['owner', 'technical'] as const) {
      expect(view(persona, body)).toEqual({ records: [], decisions: [], state: 'unreadable', incomplete: true, demo: true });
    }
  });

  it('an investigation with no record and no decision is an explicit empty view, not unreadable', () => {
    expect(view('technical', { ...INVESTIGATION, evidence: [] }, { items: [], nextCursor: null })).toEqual({ records: [], decisions: [], state: 'empty', incomplete: false, demo: true });
  });

  it('records that cannot be read are left out and the view says it is incomplete', () => {
    const body = { ...INVESTIGATION, evidence: [...INVESTIGATION.evidence, { id: 'bad', type: 'observation' }, 7] };
    const v = view('technical', body);
    expect(v).toMatchObject({ state: 'ok', incomplete: true });
    expect(v.records).toHaveLength(2);
  });

  it('only unreadable records: unreadable, not empty', () => {
    expect(view('technical', { ...INVESTIGATION, evidence: [{ id: 'bad' }] }, { items: [], nextCursor: null })).toMatchObject({ state: 'unreadable', incomplete: true });
  });

  it('a malformed GET /decisions body or item makes the view incomplete, never "no decision"', () => {
    expect(view('technical', INVESTIGATION, { nope: true })).toMatchObject({ state: 'ok', incomplete: true });
    expect(view('technical', INVESTIGATION, { items: [{ id: 'x' }], nextCursor: null })).toMatchObject({ incomplete: true });
  });

  it('a GET /decisions page with a nextCursor is only the first page: the decisions show, and the view says it is incomplete', () => {
    const v = view('technical', INVESTIGATION, { ...DECISIONS, nextCursor: 'opaque-next-page' });
    expect(v).toMatchObject({ state: 'ok', incomplete: true });
    expect(v.decisions).toEqual(view('technical').decisions);
    expect(view('technical', { ...INVESTIGATION, evidence: [] }, { items: [], nextCursor: 'opaque-next-page' })).toMatchObject({ incomplete: true });
  });

  it('a GET /decisions page without nextCursor, or with a malformed one, leaves completeness unknown: incomplete', () => {
    for (const nextCursor of [undefined, '', 0, false, {}]) {
      expect(view('technical', INVESTIGATION, { items: DECISIONS.items, nextCursor }), String(nextCursor)).toMatchObject({ incomplete: true });
    }
    expect(view('technical', INVESTIGATION, { items: DECISIONS.items })).toMatchObject({ incomplete: true });
  });

  it('the committed fixture is the last page: complete', () => {
    expect(DECISIONS.nextCursor).toBeNull();
    expect(view('technical')).toMatchObject({ state: 'ok', incomplete: false });
  });
});

describe('live origin (BACK-51 P1)', () => {
  it('a live body is never marked as demo data, in any state', () => {
    expect(investigationReadView('technical', INVESTIGATION, DECISIONS, FIXTURE_NOW, 'live')!.demo).toBe(false);
    expect(investigationReadView('owner', { nope: true }, DECISIONS, FIXTURE_NOW, 'live')).toMatchObject({ state: 'unreadable', demo: false });
  });

  it('reads the same records and decisions as the fixture: only the marker changes', () => {
    const { demo: _a, ...live } = investigationReadView('technical', INVESTIGATION, DECISIONS, FIXTURE_NOW, 'live')!;
    const { demo: _b, ...fixture } = view();
    expect(live).toEqual(fixture);
  });

  it('a failed GET /decisions (null) keeps the records and says the list is incomplete', () => {
    const v = investigationReadView('technical', INVESTIGATION, null, FIXTURE_NOW, 'live')!;
    expect(v).toMatchObject({ state: 'ok', incomplete: true, demo: false });
    expect(v.records.length).toBeGreaterThan(0);
  });

  it('Nontechnical still gets no panel in live mode', () => {
    expect(investigationReadView('nontechnical', INVESTIGATION, DECISIONS, FIXTURE_NOW, 'live')).toBeNull();
  });
});

// BACK-148 (decision L): the case project's observations that are not part of this case, and what a decision cites.
const CASE_ID = INVESTIGATION.id;
const OBS_OK = '00000000-0000-4000-8000-000000000006';
const OBS_UNKNOWN = '00000000-0000-4000-8000-000000000008';
const OBS_STALE = '00000000-0000-4000-8000-000000000009';
const obsItems = () => structuredClone(PROJECT_OBSERVATIONS.items) as unknown as Record<string, unknown>[];

describe('project observations, not part of this case (BACK-148)', () => {
  it('lists the project observations without the case\'s own (those are in the case list), newest first, as demo data', () => {
    const v = projectObservationsView('technical')!;
    expect(v).toMatchObject({ state: 'ok', atLeast: false, incomplete: false, demo: true });
    expect(v.rows.map((r) => r.id)).toEqual([OBS_OK, OBS_UNKNOWN, OBS_STALE]);
    expect(v.rows.map((r) => r.id)).not.toContain(FAILED_RUN);
  });

  it('keeps each read state honest: unknown is not read, stale stays stale; nothing unknown or stale is current', () => {
    const v = projectObservationsView('technical')!;
    const by = (id: string) => v.rows.find((r) => r.id === id)!;
    expect(by(OBS_UNKNOWN)).toMatchObject({ read: 'notRead', reason: 'unknown', label: 'unknown', ageMinutes: null });
    expect(by(OBS_STALE).read).toBe('stale');
    expect(v.rows.filter((r) => r.read === 'current').map((r) => r.id)).toEqual(v.rows.filter((r) => r.id === OBS_OK && r.read === 'current').map((r) => r.id));
  });

  it('Owner gets no source reference; Nontechnical gets nothing', () => {
    expect(projectObservationsView('owner')!.rows.every((r) => r.sourceRef === null)).toBe(true);
    expect(projectObservationsView('technical')!.rows.every((r) => r.sourceRef?.startsWith('github:'))).toBe(true);
    expect(projectObservationsView('nontechnical')).toBeNull();
  });

  it('a failed or malformed read is unreadable, never an empty list', () => {
    for (const body of [null, {}, { items: 'x' }, 'nope']) expect(projectObservationsView('technical', INVESTIGATION, body)!.state, String(body)).toBe('unreadable');
    expect(projectObservationsView('technical', { evidence: [] }, PROJECT_OBSERVATIONS)!.state).toBe('unreadable');
  });

  it('a full answer is a lower bound: atLeast follows the raw count, before the case\'s own rows are taken out', () => {
    const one = obsItems().find((r) => r['id'] === OBS_OK)!;
    const items = Array.from({ length: EVIDENCE_LIST_LIMIT }, (_, i) => ({ ...one, id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`, investigationId: i === 0 ? CASE_ID : null }));
    const v = projectObservationsView('technical', INVESTIGATION, { items }, FIXTURE_NOW, 'live')!;
    expect(v).toMatchObject({ atLeast: true, demo: false });
    expect(v.rows).toHaveLength(EVIDENCE_LIST_LIMIT - 1);
    expect(projectObservationsView('technical', INVESTIGATION, { items: items.slice(1) })!.atLeast).toBe(false);
  });

  it('a record that is not an Observation, or does not parse, is left out and said', () => {
    const items = [...obsItems(), { ...obsItems()[0]!, id: '00000000-0000-4000-8000-0000000000c1', type: 'Correlation' }, 7];
    const v = projectObservationsView('technical', INVESTIGATION, { items })!;
    expect(v).toMatchObject({ state: 'ok', incomplete: true });
    expect(v.rows.map((r) => r.id)).toEqual([OBS_OK, OBS_UNKNOWN, OBS_STALE]);
  });
});

describe('what a decision cites (BACK-148)', () => {
  const FAR = '00000000-0000-4000-8000-0000000000f0';
  const citing = (citations: string[]) => ({ items: [{ ...DECISIONS.items[0]!, citations }], nextCursor: null });
  const noCaseDecision = { ...INVESTIGATION, evidence: INVESTIGATION.evidence.filter((r) => r.type !== 'HumanDecision') };
  const cites = (citations: string[], cited: Record<string, unknown> = {}, observations: unknown = PROJECT_OBSERVATIONS) =>
    investigationReadView('technical', noCaseDecision, citing(citations), FIXTURE_NOW, 'live', { observations, cited })!.decisions[0]!.cites;

  it('a project observation is cited from outside the case, with its own read badges', () => {
    expect(cites([OBS_STALE])).toEqual([{ id: OBS_STALE, where: 'outside', row: expect.objectContaining({ id: OBS_STALE, read: 'stale' }) }]);
  });

  it('a citation past the capped list is resolved from GET /evidence/:id; one the server did not return is unknown', () => {
    const far = { ...obsItems()[0]!, id: FAR, investigationId: null };
    expect(cites([FAR], { [FAR]: far }, { items: [] })[0]).toMatchObject({ where: 'outside', row: { id: FAR } });
    expect(cites([FAR], { [FAR]: null }, { items: [] })[0]).toEqual({ id: FAR, where: 'unresolved', row: null });
    expect(cites([FAR], {}, null)[0]).toEqual({ id: FAR, where: 'unresolved', row: null });
  });

  it('an answer whose id does not match, or that is a decision, is not taken as the cited record', () => {
    expect(cites([FAR], { [FAR]: { ...obsItems()[0]!, id: OBS_OK } }, { items: [] })[0]!.where).toBe('unresolved');
    expect(cites([FAR], { [FAR]: { ...DECISIONS.items[0]!, id: FAR, type: 'HumanDecision' } }, { items: [] })[0]!.where).toBe('unresolved');
  });

  it('a resolved record of this case reads as in the case', () => {
    expect(cites([CORRELATION])[0]!.where).toBe('case');
    expect(cites([FAR], { [FAR]: { ...obsItems()[0]!, id: FAR, investigationId: CASE_ID } }, { items: [] })[0]!.where).toBe('case');
  });
});
