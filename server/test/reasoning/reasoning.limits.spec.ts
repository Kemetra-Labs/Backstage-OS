// BACK-155 AC3 and Q2: the first reliable boundary for an untrusted candidate is its serialized form. Key
// enumeration on an object someone else built cannot be bounded without enumerating it, so a future transport
// (BACK-156 live reasoning, BACK-168 MCP) hands the validator the JSON string, and anything over the length cap
// is refused before JSON.parse runs. The cap is derived from the largest result the input rules allow.
import { jest } from '@jest/globals';
import { project } from '../../src/memory/memory.projector';
import type { MemoryProjection, MemoryRow } from '../../src/memory/memory.types';
import { evaluate } from '../../src/reasoning/reasoning.evaluator';
import { MAX_ID, MAX_REQUIREMENTS, MAX_TASKS } from '../../src/reasoning/reasoning.rules';
import type { ReasoningInput } from '../../src/reasoning/reasoning.types';
import { MAX_CANDIDATE_CHARS, validateSerializedResult } from '../../src/reasoning/reasoning.validator';
import type { ItemIdentity } from '../../src/retrieval/retrieval.types';
import { at, JIRA, jiraIssue, request, sources } from '../memory/memory.fixture';

const JI = (key: string): ItemIdentity => ({ sourceId: JIRA, sourceRef: `jira:${key.slice(0, key.lastIndexOf('-'))}#issue/${key}`, kind: 'jira_issue' });
const longId = (prefix: string, n: number) => `${prefix}${n}`.padEnd(MAX_ID, 'x');

/** A UUID-shaped evidence id (36 characters), as real evidence ids are. */
const uuid = (kind: number, n: number) => `00000000-0000-4000-${8000 + kind}-${String(n).padStart(12, '0')}`;

/**
 * The worst case the rules allow: every task and every dependency exists and is in progress, so every
 * requirement yields a reason with evidence. Each item is observed twice (a run whose first and last
 * evidence ids differ), so each fact cites two UUIDs. Task refs are the real item refs: a task must be visible.
 */
function largest(): { projection: MemoryProjection; input: ReasoningInput } {
  const rows: MemoryRow[] = [];
  const twice = (key: string, kind: number, n: number) => {
    for (const [i, observedAt] of [[0, at('11:54')], [1, at('11:55')]] as const) {
      rows.push(jiraIssue(key, { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, { id: uuid(kind, n * 2 + i), observedAt }));
    }
  };
  const tasks = Array.from({ length: MAX_TASKS }, (_, t) => {
    twice(`TASK-${t + 1}`, 1, t);
    const requirements = Array.from({ length: MAX_REQUIREMENTS }, (_, r) => {
      const n = t * MAX_REQUIREMENTS + r + 1;
      twice(`DEP-${n}`, 2, n);
      return { id: longId('r', n), kind: 'dependency' as const, target: JI(`DEP-${n}`), expected: 'complete' as const };
    });
    return { id: longId('t', t), task: JI(`TASK-${t + 1}`), requirements };
  });
  return { projection: project(rows, request({ sources: sources() })), input: { specVersion: longId('spec', 1), tasks } };
}

describe('the serialized candidate boundary (BACK-155 Q2)', () => {
  const { projection, input } = largest();
  const json = JSON.stringify(evaluate(projection, input));

  it('prints the largest length (measure)', () => console.log('LARGEST', json.length));

  it('the largest legitimate result fits the cap, with room to spare, and is accepted', () => {
    // Measured on 2026-11-28 with UUID evidence ids and two observations per item: 343,707 characters. Twice the largest legitimate result fits.
    expect(json.length * 2).toBeLessThanOrEqual(MAX_CANDIDATE_CHARS);
    expect(validateSerializedResult(projection, input, json)).toBe(true);
  });

  it('a candidate of exactly the cap is parsed and validated; one more character is not', () => {
    expect(validateSerializedResult(projection, input, ' '.repeat(MAX_CANDIDATE_CHARS - json.length) + json)).toBe(true);
  });

  it('one character over the cap is refused without parsing', () => {
    const parse = jest.spyOn(JSON, 'parse');
    try {
      expect(validateSerializedResult(projection, input, ' '.repeat(MAX_CANDIDATE_CHARS + 1))).toBe(false);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it('malformed JSON, a forged result and a non-string are refused', () => {
    expect(validateSerializedResult(projection, input, '{')).toBe(false);
    expect(validateSerializedResult(projection, input, json.replace(projection.fingerprint, '0'.repeat(64)))).toBe(false);
    expect(validateSerializedResult(projection, input, 42 as unknown as string)).toBe(false);
  });
});
