// COG-08 independent review (Codex, 2026-11-27, commit 96878ac) regressions for COG-04 (BACK-107):
// duplicate task identities bypassing approval and cycle checks (High), a PR with no draft evidence
// verifying `open` (High), inherited property names in specs throwing (Medium), and validator work
// on oversized candidates (Medium). Each test failed on 96878ac.
import { project } from '../../src/memory/memory.projector';
import type { MemoryProjection, MemoryRow } from '../../src/memory/memory.types';
import { evaluate } from '../../src/reasoning/reasoning.evaluator';
import type { ReasoningInput, TaskSpec } from '../../src/reasoning/reasoning.types';
import { validateResult } from '../../src/reasoning/reasoning.validator';
import type { ItemIdentity } from '../../src/retrieval/retrieval.types';
import { at, GH, JIRA, jiraIssue, pr, REPO, request } from '../memory/memory.fixture';

const o = (id: string) => ({ id, observedAt: at('11:55') });
const JI = (key: string): ItemIdentity => ({ sourceId: JIRA, sourceRef: `jira:BACK#issue/${key}`, kind: 'jira_issue' });
const PR = (n: number): ItemIdentity => ({ sourceId: GH, sourceRef: `${REPO}#pull/${n}`, kind: 'pull_request' });
const withoutDraft = (row: MemoryRow): MemoryRow => {
  const { draft: _drop, ...payload } = row.payload as Record<string, unknown>;
  return { ...row, payload };
};

function world(): MemoryProjection {
  return project(
    [
      jiraIssue('BACK-1', { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, o('j1')),
      jiraIssue('BACK-2', { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, o('j2')),
      pr(10, { state: 'open', updatedAt: at('11:00') }, o('p10')),
      withoutDraft(pr(11, { state: 'open', updatedAt: at('11:00') }, o('p11'))),
      { ...pr(12, { state: 'open', updatedAt: at('11:00') }, o('p12')), payload: { ...pr(12, { state: 'open', updatedAt: at('11:00') }, o('p12')).payload, draft: 'no' } },
    ],
    request(),
  );
}

const input = (tasks: unknown[]): ReasoningInput => ({ specVersion: 'findings-1', tasks: tasks as TaskSpec[] });
const task = (id: string, t: ItemIdentity, requirements: unknown[] = []) => ({ id, task: t, requirements });
const dep = (id: string, target: ItemIdentity) => ({ id, kind: 'dependency', target, expected: 'complete' });
const approval = (id: string) => ({ id, kind: 'approval', expected: 'granted' });
const check = (id: string, target: unknown, expected: string) => ({ id, kind: 'check', target, expected });

describe('Codex High: duplicate task identities are refused', () => {
  it('an approval-gated task cannot be bypassed by a second spec for the same issue', () => {
    const i = input([task('protected', JI('BACK-1'), [approval('a')]), task('alternate', JI('BACK-1'))]);
    const r = evaluate(world(), i);
    expect(r).toMatchObject({ kind: 'invalid-input', refusal: 'invalid-spec', selected: null });
    expect(validateResult(world(), i, r)).toBe(true);
  });

  it.each([
    ['a1 first', [task('a1', JI('BACK-1'), [dep('d', JI('BACK-2'))]), task('a2', JI('BACK-1')), task('b', JI('BACK-2'), [dep('d', JI('BACK-1'))])]],
    ['a2 first', [task('a2', JI('BACK-1')), task('a1', JI('BACK-1'), [dep('d', JI('BACK-2'))]), task('b', JI('BACK-2'), [dep('d', JI('BACK-1'))])]],
  ])('a duplicate identity cannot hide a cycle, whatever the order (%s)', (_n, tasks) => {
    const i = input(tasks);
    const r = evaluate(world(), i);
    expect(r).toMatchObject({ kind: 'invalid-input', selected: null });
    expect(validateResult(world(), i, r)).toBe(true);
  });
});

describe('Codex High: a PR is `open` only with explicit draft: false', () => {
  it.each([
    ['missing draft field', PR(11)],
    ['non-boolean draft', PR(12)],
  ])('%s gives no-value, never ready', (_n, target) => {
    const i = input([task('T', JI('BACK-1'), [check('c', target, 'open')])]);
    const r = evaluate(world(), i);
    expect(r.tasks[0]).toMatchObject({ state: 'unknown' });
    expect(r.tasks[0]!.reasons.map((x) => x.code)).toContain('check-no-value');
    expect(validateResult(world(), i, r)).toBe(true);
  });

  it('explicit draft: false still verifies open', () => {
    expect(evaluate(world(), input([task('T', JI('BACK-1'), [check('c', PR(10), 'open')])])).tasks[0]!.state).toBe('ready');
  });
});

describe('Codex Medium: inherited property names never throw', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('a check target of kind %s is invalid-spec, and the validator agrees', (kind) => {
    const i = input([task('T', JI('BACK-1'), [check('c', { sourceId: GH, sourceRef: 'x', kind }, 'open')])]);
    const r = evaluate(world(), i);
    expect(r).toMatchObject({ kind: 'invalid-input', refusal: 'invalid-spec' });
    expect(validateResult(world(), i, r)).toBe(true);
  });
});

describe('Codex Medium: the validator bounds its work by the expected result', () => {
  it('rejects a candidate with a huge unexpected field without walking it', () => {
    const i = input([task('T', JI('BACK-1'))]);
    const forged = { ...evaluate(world(), i), junk: Array.from({ length: 1_000_000 }, (_, n) => n) };
    const start = performance.now();
    expect(validateResult(world(), i, forged)).toBe(false);
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('rejects a huge nested array inside a reason without walking it', () => {
    const i = input([task('T', JI('BACK-1'))]);
    const r = JSON.parse(JSON.stringify(evaluate(world(), i)));
    r.tasks[0].reasons[0].evidence = Array.from({ length: 1_000_000 }, () => 'x');
    const start = performance.now();
    expect(validateResult(world(), i, r)).toBe(false);
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('still rejects a non-plain object that looks equal', () => {
    const i = input([task('T', JI('BACK-1'))]);
    const r = evaluate(world(), i);
    const odd = Object.assign(Object.create({ inherited: true }), JSON.parse(JSON.stringify(r)));
    expect(validateResult(world(), i, odd)).toBe(false);
  });
});
