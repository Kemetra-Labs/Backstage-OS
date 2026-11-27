// COG-08 eleventh review (independent Claude reviewer, 2026-11-27, commit 2c93de4) regression for COG-04:
// a Proxy candidate answered the validator's descriptor reads honestly and could then answer reads
// differently, so a result the validator accepted could read as another one. Proxies are refused.
import { project } from '../../src/memory/memory.projector';
import { evaluate } from '../../src/reasoning/reasoning.evaluator';
import type { ReasoningInput } from '../../src/reasoning/reasoning.types';
import { validateResult } from '../../src/reasoning/reasoning.validator';
import { at, JIRA, jiraIssue, request } from '../memory/memory.fixture';

const row = jiraIssue('BACK-1', { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, { id: 'j1', observedAt: at('11:55') });
const input: ReasoningInput = {
  specVersion: 'px',
  tasks: [{ id: 'T1', task: { sourceId: JIRA, sourceRef: 'jira:BACK#issue/BACK-1', kind: 'jira_issue' }, requirements: [{ id: 'a', kind: 'approval' }] }],
};

describe('the validator refuses a Proxy candidate', () => {
  const p = project([row], request());
  const result = evaluate(p, input);

  it('the plain result is accepted (control)', () => {
    expect(validateResult(p, input, JSON.parse(JSON.stringify(result)))).toBe(true);
  });

  it('a pass-through proxy over the correct result is refused', () => {
    expect(validateResult(p, input, new Proxy(JSON.parse(JSON.stringify(result)), {}))).toBe(false);
  });

  it('a nested proxy is refused too', () => {
    const plain = JSON.parse(JSON.stringify(result));
    plain.tasks = new Proxy(plain.tasks, {});
    expect(validateResult(p, input, plain)).toBe(false);
  });
});
