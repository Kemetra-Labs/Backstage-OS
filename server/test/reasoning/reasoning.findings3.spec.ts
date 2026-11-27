// COG-08 third review, complete rerun (Codex, 2026-11-27, commit 5375068) regression for COG-04: an
// array with a custom prototype carrying an inherited `toJSON` passed the validator, then serialized
// to no tasks. Failed on 5375068.
import { project } from '../../src/memory/memory.projector';
import { evaluate } from '../../src/reasoning/reasoning.evaluator';
import type { ReasoningInput } from '../../src/reasoning/reasoning.types';
import { validateResult } from '../../src/reasoning/reasoning.validator';
import { at, JIRA, jiraIssue, request } from '../memory/memory.fixture';

const world = () => project([jiraIssue('BACK-1', { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, { id: 'j1', observedAt: at('11:55') })], request());
const input: ReasoningInput = { specVersion: 'f3', tasks: [{ id: 'T', task: { sourceId: JIRA, sourceRef: 'jira:BACK#issue/BACK-1', kind: 'jira_issue' }, requirements: [] }] };

describe('the validator requires standard arrays', () => {
  it('rejects an array whose prototype supplies toJSON', () => {
    const r = JSON.parse(JSON.stringify(evaluate(world(), input)));
    const proto = Object.create(Array.prototype, { toJSON: { value: () => [] } });
    Object.setPrototypeOf(r.tasks, proto);
    expect(JSON.stringify(r)).toContain('"tasks":[]'); // the hook really changes the serialized result
    expect(validateResult(world(), input, r)).toBe(false);
  });

  it('still accepts the JSON round-trip of a correct result (control)', () => {
    expect(validateResult(world(), input, JSON.parse(JSON.stringify(evaluate(world(), input))))).toBe(true);
  });
});
