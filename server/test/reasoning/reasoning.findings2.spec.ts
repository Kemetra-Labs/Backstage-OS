// COG-08 second independent review (Codex, 2026-11-27, commit b980034) regressions for COG-04:
// sparse arrays in a spec made the evaluator throw instead of refusing; the validator accepted arrays
// with extra own properties or a serialization hook, and accessor properties. Failed on b980034.
import { project } from '../../src/memory/memory.projector';
import { evaluate } from '../../src/reasoning/reasoning.evaluator';
import type { ReasoningInput } from '../../src/reasoning/reasoning.types';
import { validateResult } from '../../src/reasoning/reasoning.validator';
import { at, JIRA, jiraIssue, request } from '../memory/memory.fixture';

const world = () => project([jiraIssue('BACK-1', { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, { id: 'j1', observedAt: at('11:55') })], request());
const T = { sourceId: JIRA, sourceRef: 'jira:BACK#issue/BACK-1', kind: 'jira_issue' };
const good: ReasoningInput = { specVersion: 'f2', tasks: [{ id: 'T', task: T, requirements: [] }] };

describe('sparse arrays are refused, never thrown on', () => {
  it.each([
    ['a hole in requirements', { specVersion: 'f2', tasks: [{ id: 'T', task: T, requirements: new Array(1) }] }],
    ['a hole in tasks', { specVersion: 'f2', tasks: new Array(1) }],
  ])('%s', (_n, i) => {
    const r = evaluate(world(), i as unknown as ReasoningInput);
    expect(r).toMatchObject({ kind: 'invalid-input', refusal: 'invalid-spec' });
    expect(validateResult(world(), i as unknown as ReasoningInput, r)).toBe(true);
  });
});

describe('the validator accepts plain data only', () => {
  const fresh = () => JSON.parse(JSON.stringify(evaluate(world(), good)));

  it('rejects an extra own property on an array', () => {
    const r = fresh();
    r.tasks.extra = 1;
    expect(validateResult(world(), good, r)).toBe(false);
  });

  it('rejects a toJSON hook on an array', () => {
    const r = fresh();
    r.tasks.toJSON = () => [];
    expect(validateResult(world(), good, r)).toBe(false);
  });

  it('rejects an accessor property that returns the right value', () => {
    const r = fresh();
    const state = r.tasks[0].state;
    delete r.tasks[0].state;
    Object.defineProperty(r.tasks[0], 'state', { get: () => state, enumerable: true });
    expect(validateResult(world(), good, r)).toBe(false);
  });

  it('still accepts the correct result (control)', () => {
    expect(validateResult(world(), good, fresh())).toBe(true);
  });
});
