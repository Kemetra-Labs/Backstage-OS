// COG-08 fourth review (Codex, 2026-11-27, commit 827a210) regression for COG-04: the validator scanned
// the whole projection for every identity lookup (millions of visits at the T1 bounds). It now indexes
// visible identities once. Counted, not timed: a proxy records reads of the items array. Failed on 827a210.
import { project } from '../../src/memory/memory.projector';
import type { MemoryProjection } from '../../src/memory/memory.types';
import { evaluate } from '../../src/reasoning/reasoning.evaluator';
import type { ReasoningInput } from '../../src/reasoning/reasoning.types';
import { validateResult } from '../../src/reasoning/reasoning.validator';
import { at, GH, JIRA, jiraIssue, pr, REPO, request } from '../memory/memory.fixture';

describe('the validator looks identities up through one indexed pass', () => {
  it('item reads stay linear in the projection size at the T1 bounds', () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) => jiraIssue(`BACK-${i + 1}`, { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, { id: `j${i}`, observedAt: at('11:55') })),
      ...Array.from({ length: 500 }, (_, i) => pr(i + 1, { updatedAt: at('11:00') }, { id: `p${i}`, observedAt: at('11:55') })),
    ];
    const base = project(rows, request());
    const input: ReasoningInput = {
      specVersion: 'idx',
      tasks: Array.from({ length: 50 }, (_, t) => ({
        id: `T${t}`,
        task: { sourceId: JIRA, sourceRef: `jira:BACK#issue/BACK-${t + 1}`, kind: 'jira_issue' },
        requirements: Array.from({ length: 20 }, (_, r) => ({
          id: `c${r}`,
          kind: 'check' as const,
          target: { sourceId: GH, sourceRef: `${REPO}#pull/${100000 + r}`, kind: 'pull_request' },
          expected: 'open' as const,
        })),
      })),
    };
    const result = evaluate(base, input);
    let reads = 0;
    const counted = new Proxy([...base.items], {
      get: (target, key, receiver) => {
        if (typeof key === 'string' && /^[0-9]+$/.test(key)) reads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const p: MemoryProjection = { ...base, items: counted };
    expect(validateResult(p, input, result)).toBe(true);
    expect(reads).toBeLessThan(base.items.length * 5);
  });
});
