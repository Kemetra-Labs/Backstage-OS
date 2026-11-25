// Body validation for the evidence write routes (BACK-55 decisions, BACK-50 notes). No database.
import { BadRequestException } from '@nestjs/common';
import { decisionBody, noteBody } from '../../src/evidence/evidence.body';

const INV = '11111111-1111-4111-8111-111111111111';
const E1 = '22222222-2222-4222-8222-222222222222';

const rejects = (fn: () => unknown) => expect(fn).toThrow(BadRequestException);

describe('noteBody', () => {
  const ok = { type: 'Hypothesis', text: 'The timeout follows the token rotation', evidenceIds: [E1] };

  it('accepts a Correlation or a Hypothesis with text and at least one citation', () => {
    expect(noteBody(ok, INV)).toEqual({ investigationId: INV, type: 'Hypothesis', text: ok.text, evidenceIds: [E1] });
    expect(noteBody({ ...ok, type: 'Correlation' }, INV).type).toBe('Correlation');
  });

  it('refuses a missing or non-note type (BACK-54: no save without an explicit type)', () => {
    for (const type of [undefined, null, '', 'Observation', 'HumanDecision', 'hypothesis', ['Hypothesis'], 1]) {
      rejects(() => noteBody({ ...ok, type }, INV));
    }
  });

  it('refuses a note that cites nothing, too many ids or non-string ids', () => {
    for (const evidenceIds of [undefined, [], 'x', [1], Array.from({ length: 51 }, () => E1)]) {
      rejects(() => noteBody({ ...ok, evidenceIds }, INV));
    }
    expect(noteBody({ ...ok, evidenceIds: Array.from({ length: 50 }, () => E1) }, INV).evidenceIds).toHaveLength(50);
  });

  it('refuses blank, oversized or unstorable text', () => {
    for (const text of [undefined, '', '   ', 'x'.repeat(4001), 'a\u0000b', 'lone \uD800 surrogate', 7]) {
      rejects(() => noteBody({ ...ok, text }, INV));
    }
    expect(noteBody({ ...ok, text: 'x'.repeat(4000) }, INV).text).toHaveLength(4000);
  });

  it('refuses a body that is not an object', () => {
    for (const body of [undefined, null, 'text', 3, []]) rejects(() => noteBody(body, INV));
  });
});

describe('decisionBody (unchanged rules, now shared)', () => {
  const ok = { decision: 'Roll back', rationale: 'Build broken', evidenceIds: [] as string[] };

  it('accepts a decision with no citations', () => {
    expect(decisionBody(ok, INV)).toEqual({ investigationId: INV, ...ok });
  });

  it('refuses blank or oversized fields and bad citation lists', () => {
    rejects(() => decisionBody({ ...ok, decision: '' }, INV));
    rejects(() => decisionBody({ ...ok, decision: 'x'.repeat(2001) }, INV));
    rejects(() => decisionBody({ ...ok, rationale: 'x'.repeat(4001) }, INV));
    rejects(() => decisionBody({ ...ok, evidenceIds: 'nope' }, INV));
    rejects(() => decisionBody({ ...ok, evidenceIds: Array.from({ length: 51 }, () => E1) }, INV));
  });
});
