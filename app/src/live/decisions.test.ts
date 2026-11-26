// BACK-51 P3: the decision form's rules and its one POST. The fetcher is injected: nothing here touches the network.
import { describe, expect, it, vi } from 'vitest';
import {
  createSubmitGuard, DECISION_MAX, draftProblems, EMPTY_DRAFT, EVIDENCE_MAX, investigationIdOf, planSubmit, RATIONALE_MAX, refreshesList, submitDecision, type DecisionDraft, type SubmitResult,
} from './decisions';

const INV = '00000000-0000-4000-8000-000000000004';
const EV = '00000000-0000-4000-8000-000000000001';
const GOOD: DecisionDraft = { decision: 'Revert pull request #42', rationale: 'The failures began after it merged.', evidenceIds: [EV] };

function reply(status: number, text = '') {
  return vi.fn(async (_p: string, _i?: RequestInit) => new Response(status === 204 ? null : text, { status }));
}

describe('draftProblems', () => {
  it('accepts a good draft, with or without cited evidence', () => {
    expect(draftProblems(GOOD)).toEqual([]);
    expect(draftProblems({ ...GOOD, evidenceIds: [] })).toEqual([]);
  });

  it('refuses a blank decision or rationale, spaces and newlines included', () => {
    expect(draftProblems(EMPTY_DRAFT)).toEqual(['decisionBlank', 'rationaleBlank']);
    expect(draftProblems({ ...GOOD, decision: ' \n\t ' })).toEqual(['decisionBlank']);
    expect(draftProblems({ ...GOOD, rationale: '' })).toEqual(['rationaleBlank']);
  });

  it('counts UTF-16 code units, like the server: the limit is exact', () => {
    expect(draftProblems({ ...GOOD, decision: 'x'.repeat(DECISION_MAX) })).toEqual([]);
    expect(draftProblems({ ...GOOD, decision: 'x'.repeat(DECISION_MAX + 1) })).toEqual(['decisionTooLong']);
    expect(draftProblems({ ...GOOD, rationale: 'x'.repeat(RATIONALE_MAX) })).toEqual([]);
    expect(draftProblems({ ...GOOD, rationale: 'x'.repeat(RATIONALE_MAX + 1) })).toEqual(['rationaleTooLong']);
    // Arabic letters are one unit each; an emoji is two, so 1000 of them are 2000 units and 1001 are too long.
    expect(draftProblems({ ...GOOD, decision: 'ع'.repeat(DECISION_MAX) })).toEqual([]);
    expect(draftProblems({ ...GOOD, decision: '😀'.repeat(1000) })).toEqual([]);
    expect(draftProblems({ ...GOOD, decision: '😀'.repeat(1001) })).toEqual(['decisionTooLong']);
  });

  it('refuses text the server could not store: NUL and an unpaired surrogate', () => {
    expect(draftProblems({ ...GOOD, decision: `a${String.fromCharCode(0)}b` })).toEqual(['unstorable']);
    expect(draftProblems({ ...GOOD, rationale: 'a\ud800b' })).toEqual(['unstorable']);
    expect(draftProblems({ ...GOOD, rationale: 'a\udc00' })).toEqual(['unstorable']);
    expect(draftProblems({ ...GOOD, decision: '😀' })).toEqual([]);
  });

  it('allows at most 50 cited records', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(draftProblems({ ...GOOD, evidenceIds: ids(EVIDENCE_MAX) })).toEqual([]);
    expect(draftProblems({ ...GOOD, evidenceIds: ids(EVIDENCE_MAX + 1) })).toEqual(['tooManyEvidence']);
  });
});

describe('submitDecision', () => {
  it('POSTs the three fields to the case, as JSON, and reads 201 as recorded', async () => {
    const f = reply(201, '{"id":"x"}');
    expect(await submitDecision(INV, GOOD, undefined, f)).toBe('recorded');
    expect(f).toHaveBeenCalledTimes(1);
    const [path, init] = f.mock.calls[0]!;
    expect(path).toBe(`/api/investigations/${INV}/decisions`);
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect(JSON.parse(init?.body as string)).toEqual({ decision: GOOD.decision, rationale: GOOD.rationale, evidenceIds: [EV] });
  });

  it('sends the text as typed (no trimming), so what the owner sees is what is stored', async () => {
    const f = reply(201, '{}');
    await submitDecision(INV, { ...GOOD, decision: '  keep  ' }, undefined, f);
    expect(JSON.parse(f.mock.calls[0]![1]?.body as string).decision).toBe('  keep  ');
  });

  it('maps the server answers: 400 invalid, 401 and 404 not_found (alike), 429, gateway and network unavailable, 5xx error', async () => {
    expect(await submitDecision(INV, GOOD, undefined, reply(400))).toBe('invalid');
    expect(await submitDecision(INV, GOOD, undefined, reply(401))).toBe('not_found');
    expect(await submitDecision(INV, GOOD, undefined, reply(404, '{"error":{}}'))).toBe('not_found');
    expect(await submitDecision(INV, GOOD, undefined, reply(429))).toBe('rate_limited');
    expect(await submitDecision(INV, GOOD, undefined, reply(502))).toBe('unavailable');
    expect(await submitDecision(INV, GOOD, undefined, reply(500))).toBe('error');
    const down = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    expect(await submitDecision(INV, GOOD, undefined, down)).toBe('unavailable');
  });

  it('reads any other success as an error, never as recorded', async () => {
    expect(await submitDecision(INV, GOOD, undefined, reply(200, '{}'))).toBe('error');
    expect(await submitDecision(INV, GOOD, undefined, reply(204))).toBe('error');
  });

  it('makes no request for a draft the server would refuse, or an id that is not a UUID', async () => {
    const f = reply(201);
    expect(await submitDecision(INV, EMPTY_DRAFT, undefined, f)).toBe('invalid');
    expect(await submitDecision('../auth/me', GOOD, undefined, f)).toBe('invalid');
    expect(await submitDecision(`${INV}/x`, GOOD, undefined, f)).toBe('invalid');
    expect(await submitDecision('', GOOD, undefined, f)).toBe('invalid');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('createSubmitGuard (D5 (a): a double click records one decision)', () => {
  it('runs one at a time: a second call while one is in flight does nothing and returns null', async () => {
    const guard = createSubmitGuard();
    let release!: (v: string) => void;
    const slow = vi.fn(() => new Promise<string>((r) => { release = r; }));
    const first = guard.run(slow);
    expect(guard.run(slow)).toBeNull();
    expect(guard.run(slow)).toBeNull();
    expect(slow).toHaveBeenCalledTimes(1);
    release('done');
    expect(await first).toBe('done');
    expect(guard.run(async () => 'next')).not.toBeNull(); // free again
  });

  it('is free again after a failure', async () => {
    const guard = createSubmitGuard();
    await expect(guard.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await guard.run(async () => 'ok')).toBe('ok');
  });
});

describe('investigationIdOf', () => {
  it('takes only a UUID id from an investigation body', () => {
    expect(investigationIdOf({ id: INV, evidence: [] })).toBe(INV);
    for (const b of [null, undefined, 'x', [], {}, { id: 4 }, { id: 'abc' }, { id: `${INV}/x` }, { id: '../auth/me' }]) expect(investigationIdOf(b), JSON.stringify(b)).toBeNull();
  });
});

describe('planSubmit (what a submit does with the draft and the records that can still be cited)', () => {
  const OTHER = '00000000-0000-4000-8000-000000000002';

  it('sends a sendable draft as it is', () => {
    expect(planSubmit(GOOD, [EV, OTHER])).toEqual({ kind: 'send', sendable: GOOD });
    expect(planSubmit({ ...GOOD, evidenceIds: [] }, [])).toEqual({ kind: 'send', sendable: { ...GOOD, evidenceIds: [] } });
  });

  it('sends nothing while a field is blank or over its limit', () => {
    expect(planSubmit(EMPTY_DRAFT, [EV])).toEqual({ kind: 'problems' });
    expect(planSubmit({ ...GOOD, decision: 'x'.repeat(DECISION_MAX + 1) }, [EV])).toEqual({ kind: 'problems' });
  });

  it('a ticked record that is no longer listed is pruned and nothing is sent, so the owner sees the change first', () => {
    const plan = planSubmit({ ...GOOD, evidenceIds: [EV, OTHER] }, [EV]);
    expect(plan).toEqual({ kind: 'citationsChanged', sendable: { ...GOOD, evidenceIds: [EV] } });
    expect(planSubmit({ ...GOOD, evidenceIds: [EV] }, [])).toMatchObject({ kind: 'citationsChanged' });
  });
});

describe('refreshesList (the decision list the copy points the owner to is read again)', () => {
  it('after a recorded decision and after the two answers where the server may have recorded it anyway', () => {
    const yes: SubmitResult[] = ['recorded', 'unavailable', 'error'];
    const no: SubmitResult[] = ['invalid', 'not_found', 'rate_limited'];
    for (const r of yes) expect(refreshesList(r), r).toBe(true);
    for (const r of no) expect(refreshesList(r), r).toBe(false);
  });
});
