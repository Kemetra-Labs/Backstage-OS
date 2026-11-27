// COG-04 S1 (BACK-107): deterministic advisory reasoning and its independent validator, specified by
// docs/planning/BACK-107/cog-04-design.md (T1 to T7). Synthetic data only.
import { canonicalJson } from '../../src/memory/memory.canonical';
import { project } from '../../src/memory/memory.projector';
import type { MemoryProjection, MemoryRow } from '../../src/memory/memory.types';
import { evaluate } from '../../src/reasoning/reasoning.evaluator';
import { REASONING_POLICY_VERSION } from '../../src/reasoning/reasoning.rules';
import type { ReasoningInput, ReasoningResult, TaskSpec } from '../../src/reasoning/reasoning.types';
import { validateResult } from '../../src/reasoning/reasoning.validator';
import type { ItemIdentity } from '../../src/retrieval/retrieval.types';
import { at, GH, ghIssue, JIRA, jiraIssue, pr, REPO, request, sources } from '../memory/memory.fixture';

const JIRA2 = '00000000-0000-4000-8000-0000000000d4';
const o = (id: string, observedAt = at('11:55')) => ({ id, observedAt });
const JI = (key: string, sourceId = JIRA): ItemIdentity => ({ sourceId, sourceRef: `jira:${key.slice(0, key.lastIndexOf('-'))}#issue/${key}`, kind: 'jira_issue' });
const PR = (n: number): ItemIdentity => ({ sourceId: GH, sourceRef: `${REPO}#pull/${n}`, kind: 'pull_request' });
const ISSUE = (n: number): ItemIdentity => ({ sourceId: GH, sourceRef: `${REPO}#issue/${n}`, kind: 'issue' });

function rows(): MemoryRow[] {
  return [
    jiraIssue('BACK-1', { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, o('j1')),
    jiraIssue('BACK-2', { updatedAt: at('11:00'), statusCategory: 'done' }, o('j2')),
    jiraIssue('BACK-3', { updatedAt: at('11:00'), statusCategory: 'new' }, o('j3')),
    jiraIssue('BACK-5', { updatedAt: at('11:00'), statusCategory: 'done' }, o('j5', at('11:30'))), // stale at 12:00
    jiraIssue('BACK-6', { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, o('j6')),
    jiraIssue('BACK-7', { updatedAt: at('11:00'), statusCategory: 'weird' }, o('j7')), // no value
    { ...jiraIssue('SEC-1', { updatedAt: at('11:00'), statusCategory: 'done' }, o('s1')), sourceId: JIRA2 },
    pr(12, { state: 'open', updatedAt: at('11:00') }, o('p12')),
    pr(13, { state: 'closed', updatedAt: at('11:00') }, o('p13')),
    pr(14, { state: 'open', draft: true, updatedAt: at('11:00') }, o('p14')),
    ghIssue(4, { updatedAt: at('11:00') }, o('i4')),
  ];
}

const projectionOf = (rs: readonly MemoryRow[]): MemoryProjection =>
  project(rs, request({ sources: [...sources(), { sourceId: JIRA2, provider: 'jira', purgeHorizon: null }] }));
const world = () => projectionOf(rows());
/** The second Jira source is not visible to the reader: its rows never reach the projection. */
const secondJiraHidden = () => projectionOf(rows().filter((r) => r.sourceId !== JIRA2));

const input = (tasks: TaskSpec[]): ReasoningInput => ({ specVersion: 'spec-test-1', tasks });
const task = (id: string, t: ItemIdentity, requirements: TaskSpec['requirements'] = []): TaskSpec => ({ id, task: t, requirements });
const dep = (id: string, target: ItemIdentity) => ({ id, kind: 'dependency' as const, target, expected: 'complete' as const });
const check = (id: string, target: ItemIdentity, expected: 'open' | 'closed' | 'draft') => ({ id, kind: 'check' as const, target, expected });
const approval = (id: string) => ({ id, kind: 'approval' as const, expected: 'granted' as const });
const only = (r: ReasoningResult) => r.tasks[0]!;

describe('classification (T2, T4)', () => {
  it('ready when the lifecycle is pending and every requirement is verified as expected; recommended', () => {
    const r = evaluate(world(), input([task('T1', JI('BACK-1'), [dep('d', JI('BACK-2')), check('c', PR(13), 'closed'), check('e', PR(14), 'draft')])]));
    expect(r.kind).toBe('recommended');
    expect(r.selected).toBe('T1');
    expect(only(r)).toMatchObject({ id: 'T1', state: 'ready', task: JI('BACK-1') });
    expect(only(r).reasons.map((x) => x.code)).toEqual(['lifecycle-pending', 'check-satisfied', 'dependency-satisfied', 'check-satisfied']);
    expect(only(r).evidence).toEqual(['j1', 'j2', 'p13', 'p14']);
  });

  it('a done task is done', () => {
    expect(only(evaluate(world(), input([task('T1', JI('BACK-2'))]))).state).toBe('done');
  });

  it.each([
    ['dependency still pending', dep('d', JI('BACK-3')), 'dependency-unsatisfied'],
    ['check expects closed, PR is open', check('c', PR(12), 'closed'), 'check-unsatisfied'],
    ['check expects open, PR is a draft', check('c', PR(14), 'open'), 'check-unsatisfied'],
  ])('blocked: %s', (_n, req, code) => {
    const t = only(evaluate(world(), input([task('T1', JI('BACK-1'), [req])])));
    expect(t.state).toBe('blocked');
    expect(t.reasons.map((x) => x.code)).toContain(code);
  });

  it('a blocker wins over an unknown requirement', () => {
    const t = only(evaluate(world(), input([task('T1', JI('BACK-1'), [dep('a', JI('BACK-3')), dep('b', JI('BACK-5'))])])));
    expect(t.state).toBe('blocked');
  });

  it.each([
    ['stale dependency', dep('d', JI('BACK-5')), 'dependency-stale'],
    ['dependency with no lifecycle value', dep('d', JI('BACK-7')), 'dependency-no-value'],
    ['nonexistent dependency', dep('d', JI('BACK-99')), 'dependency-missing'],
  ])('unknown: %s', (_n, req, code) => {
    const r = evaluate(world(), input([task('T1', JI('BACK-1'), [req])]));
    expect(only(r).state).toBe('unknown');
    expect(only(r).reasons.map((x) => x.code)).toContain(code);
    expect(r.kind).toBe('insufficient-evidence');
  });

  it('a closed PR is never claimed as merged or complete (no such rule)', () => {
    const t = only(evaluate(world(), input([task('T1', JI('BACK-1'), [check('c', PR(13), 'closed')])])));
    expect(JSON.stringify(t)).not.toMatch(/merged|complete"/);
  });

  it('a GitHub issue check uses its open/closed state', () => {
    expect(only(evaluate(world(), input([task('T1', JI('BACK-1'), [check('c', ISSUE(4), 'open')])]))).state).toBe('ready');
  });
});

describe('approval gates are hard and cannot pass in v1 (T3)', () => {
  it('a task with an approval requirement is never ready, even with everything else satisfied', () => {
    const r = evaluate(world(), input([task('T1', JI('BACK-1'), [dep('d', JI('BACK-2')), approval('a')])]));
    expect(only(r).state).toBe('unknown');
    expect(only(r).reasons.find((x) => x.requirement === 'a')).toEqual({ code: 'approval-missing', requirement: 'a', evidence: [], detail: 'approval-evidence-not-wired' });
    expect(r.selected).toBeNull();
  });
});

describe('hidden items never leak (T2)', () => {
  it('a hidden dependency is identical to a nonexistent one, with no ref or id of it', () => {
    const hidden = evaluate(secondJiraHidden(), input([task('T1', JI('BACK-1'), [dep('d', JI('SEC-1', JIRA2))])]));
    const nonexistent = evaluate(secondJiraHidden(), input([task('T1', JI('BACK-1'), [dep('d', JI('SEC-9', JIRA2))])]));
    expect(only(hidden)).toEqual(only(nonexistent));
    expect(JSON.stringify(only(hidden))).not.toMatch(/SEC-|s1/);
    // the same dependency, visible, is satisfied: the difference is visibility alone
    expect(only(evaluate(world(), input([task('T1', JI('BACK-1'), [dep('d', JI('SEC-1', JIRA2))])]))).state).toBe('ready');
  });

  it('a task whose own item is not visible is unknown, with no item and no evidence', () => {
    const t = only(evaluate(secondJiraHidden(), input([task('T1', JI('SEC-1', JIRA2))])));
    expect(t).toEqual({ id: 'T1', task: null, state: 'unknown', reasons: [{ code: 'task-missing', evidence: [] }], evidence: [] });
  });

  it('a cycle through a hidden task item is not revealed by a refusal', () => {
    const specs = (key: string) => input([task('T1', JI('BACK-1'), [dep('d', JI(key, JIRA2))]), task('T2', JI(key, JIRA2), [dep('d', JI('BACK-1'))])]);
    const hidden = evaluate(secondJiraHidden(), specs('SEC-1'));
    expect(hidden.kind).not.toBe('invalid-input');
    expect(canonicalJson({ ...hidden, fingerprint: '' })).toBe(canonicalJson({ ...evaluate(secondJiraHidden(), specs('SEC-9')), fingerprint: '' }));
  });
});

describe('cycles, ranking and the recommendation (T5)', () => {
  it('a dependency cycle among visible tasks is refused as a whole', () => {
    const r = evaluate(world(), input([task('T1', JI('BACK-1'), [dep('d', JI('BACK-6'))]), task('T2', JI('BACK-6'), [dep('d', JI('BACK-1'))])]));
    expect(r).toMatchObject({ kind: 'invalid-input', refusal: 'cycle', selected: null, tasks: [] });
  });

  it('the first ready task by spec id is selected, whatever the input order', () => {
    const a = task('B', JI('BACK-6'));
    const b = task('A', JI('BACK-1'));
    const r1 = evaluate(world(), input([a, b]));
    const r2 = evaluate(world(), input([b, a]));
    expect(r1.selected).toBe('A');
    expect(canonicalJson(r1)).toBe(canonicalJson(r2));
  });

  it('no ready task and nothing unknown is no-ready-task', () => {
    expect(evaluate(world(), input([task('T1', JI('BACK-2'))])).kind).toBe('no-ready-task');
  });

  it('carries versions and the memory fingerprint, and nothing that executes or approves', () => {
    const p = world();
    const r = evaluate(p, input([task('T1', JI('BACK-1'))]));
    expect(r).toMatchObject({ fingerprint: p.fingerprint, policyVersion: p.policyVersion, reasoningPolicyVersion: REASONING_POLICY_VERSION, specVersion: 'spec-test-1' });
    expect(JSON.stringify(r)).not.toMatch(/"(?:execute|approve|apply|dispatch)/i);
  });
});

describe('invalid input is refused, never repaired (T1)', () => {
  const bad: [string, unknown][] = [
    ['duplicate task ids', input([task('T1', JI('BACK-1')), task('T1', JI('BACK-6'))])],
    ['duplicate requirement ids', input([task('T1', JI('BACK-1'), [dep('d', JI('BACK-2')), dep('d', JI('BACK-3'))])])],
    ['a task that is not a Jira issue', input([task('T1', PR(12))])],
    ['a dependency on a PR', input([task('T1', JI('BACK-1'), [dep('d', PR(13))])])],
    ['a check on a Jira issue', input([task('T1', JI('BACK-1'), [check('c', JI('BACK-2'), 'closed')])])],
    ['an approval with a target', input([task('T1', JI('BACK-1'), [{ ...approval('a'), target: PR(12) }])])],
    ['a check with an impossible value', input([task('T1', JI('BACK-1'), [{ ...check('c', PR(12), 'open'), expected: 'merged' as 'open' }])])],
    ['an unknown requirement kind', input([task('T1', JI('BACK-1'), [{ id: 'x', kind: 'vibe' as 'check', target: PR(12), expected: 'open' }])])],
    ['too many tasks', input(Array.from({ length: 51 }, (_, i) => task(`T${i}`, JI('BACK-1'))))],
    ['too many requirements', input([task('T1', JI('BACK-1'), Array.from({ length: 21 }, (_, i) => dep(`d${i}`, JI('BACK-2'))))])],
    ['an over-long id', input([task('x'.repeat(101), JI('BACK-1'))])],
    ['a missing spec version', { tasks: [] }],
    ['not an object', 'tasks please'],
  ];
  it.each(bad)('%s', (_n, i) => {
    expect(evaluate(world(), i as ReasoningInput)).toMatchObject({ kind: 'invalid-input', refusal: 'invalid-spec', selected: null, tasks: [] });
  });
});

describe('independent validator (T6)', () => {
  const cases: [string, ReasoningInput][] = [
    ['ready', input([task('T1', JI('BACK-1'), [dep('d', JI('BACK-2')), check('c', PR(13), 'closed')])])],
    ['blocked and unknown', input([task('T1', JI('BACK-1'), [dep('d', JI('BACK-3'))]), task('T2', JI('BACK-6'), [dep('d', JI('BACK-5')), approval('a')])])],
    ['cycle', input([task('T1', JI('BACK-1'), [dep('d', JI('BACK-6'))]), task('T2', JI('BACK-6'), [dep('d', JI('BACK-1'))])])],
    ['missing task', input([task('T1', JI('NOPE-1'))])],
    ['invalid spec', input([task('T1', PR(12))])],
  ];

  it.each(cases)('accepts the evaluator\'s own result: %s', (_n, i) => {
    expect(validateResult(world(), i, evaluate(world(), i))).toBe(true);
  });

  const forge = (f: (r: Record<string, unknown> & ReasoningResult) => unknown) => {
    const i = cases[1]![1];
    const r = JSON.parse(JSON.stringify(evaluate(world(), i)));
    return validateResult(world(), i, f(r));
  };

  it.each<[string, (r: Record<string, unknown> & ReasoningResult) => unknown]>([
    ['a changed state', (r) => ({ ...r, tasks: r.tasks.map((t, n) => (n === 0 ? { ...t, state: 'ready' } : t)) })],
    ['a forged selection', (r) => ({ ...r, kind: 'recommended', selected: 'T2' })],
    ['an added evidence id from a hidden item', (r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t, evidence: [...t.evidence, 's1'] })) })],
    ['a dropped reason', (r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t, reasons: t.reasons.slice(1) })) })],
    ['an extra field', (r) => ({ ...r, execute: true })],
    ['reordered tasks', (r) => ({ ...r, tasks: [...r.tasks].reverse() })],
    ['another fingerprint', (r) => ({ ...r, fingerprint: '0'.repeat(64) })],
    ['not JSON data', (r) => ({ ...r, tasks: undefined })],
    ['null', () => null],
  ])('rejects %s', (_n, f) => {
    expect(forge(f)).toBe(false);
  });

  it('rejects a result computed for another reader\'s projection', () => {
    const i = cases[0]![1];
    expect(validateResult(secondJiraHidden(), i, evaluate(world(), i))).toBe(false);
  });
});

describe('determinism (T7)', () => {
  it('row order changes nothing', () => {
    const i = input([task('T1', JI('BACK-1'), [dep('d', JI('BACK-2'))]), task('T2', JI('BACK-6'), [check('c', PR(12), 'closed')])]);
    expect(canonicalJson(evaluate(projectionOf([...rows()].reverse()), i))).toBe(canonicalJson(evaluate(world(), i)));
  });
});
