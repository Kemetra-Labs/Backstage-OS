// Deterministic advisory evaluator (BACK-107 T2 to T5), adapted from the COG-01 research reasoner:
// facts from the reader's memory projection, classification, evidence-linked reasons, DFS cycle refusal
// and the first ready task by spec id. Pure. A hidden item gives the same generic `missing` fact as a
// nonexistent one, with no ref, id or source of it.
import type { MemoryItem, MemoryProjection } from '../memory/memory.types';
import type { ItemIdentity } from '../retrieval/retrieval.types';
import { APPROVAL_DETAIL, isValidInput, REASONING_POLICY_VERSION, specVersionOf, valueOf } from './reasoning.rules';
import type { Fact, ReasoningInput, ReasoningResult, Reason, RequirementSpec, TaskResult, TaskSpec } from './reasoning.types';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (xs: readonly string[]): string[] => [...new Set(xs)].sort(cmp);
const keyOf = (i: ItemIdentity): string => JSON.stringify([i.sourceId, i.sourceRef, i.kind]);

const MISSING: Fact = { state: 'missing', value: 'unknown', evidence: [] };

function factOf(item: MemoryItem | undefined): Fact {
  if (!item) return MISSING;
  const run = item.current;
  const evidence = run ? sortedUnique([run.firstEvidenceId, run.lastEvidenceId]) : [];
  if (item.status !== 'verified' || !run) return { state: item.status, value: 'unknown', evidence };
  const value = valueOf(item.kind, run.payload);
  return value === null ? { state: 'no-value', value: 'unknown', evidence } : { state: 'verified', value, evidence };
}

function hasCycle(tasks: readonly TaskSpec[], visible: ReadonlyMap<string, MemoryItem>): boolean {
  // Edges only between task items the reader can see: a refusal never reveals a hidden item (T1).
  const byTaskKey = new Map(tasks.filter((t) => visible.has(keyOf(t.task))).map((t) => [keyOf(t.task), t]));
  const next = (t: TaskSpec): TaskSpec[] =>
    t.requirements.flatMap((r) => (r.kind === 'dependency' && r.target ? [byTaskKey.get(keyOf(r.target))].filter((x): x is TaskSpec => !!x) : []));
  const open = new Set<string>();
  const done = new Set<string>();
  const visit = (t: TaskSpec): boolean => {
    if (open.has(t.id)) return true;
    if (done.has(t.id)) return false;
    open.add(t.id);
    if (next(t).some(visit)) return true;
    open.delete(t.id);
    done.add(t.id);
    return false;
  };
  return [...byTaskKey.values()].some(visit);
}

function requirementReason(r: RequirementSpec, visible: ReadonlyMap<string, MemoryItem>): { reason: Reason; fact: Fact } {
  if (r.kind === 'approval') return { fact: MISSING, reason: { code: 'approval-missing', requirement: r.id, evidence: [], detail: APPROVAL_DETAIL } };
  const fact = factOf(visible.get(keyOf(r.target!)));
  const suffix = fact.state !== 'verified' ? fact.state : fact.value === r.expected ? 'satisfied' : 'unsatisfied';
  return { fact, reason: { code: `${r.kind}-${suffix}`, requirement: r.id, evidence: fact.evidence } };
}

function classify(spec: TaskSpec, visible: ReadonlyMap<string, MemoryItem>): TaskResult {
  const item = visible.get(keyOf(spec.task));
  if (!item) return { id: spec.id, task: null, state: 'unknown', reasons: [{ code: 'task-missing', evidence: [] }], evidence: [] };
  const life = factOf(item);
  const reasons: Reason[] = [{ code: `lifecycle-${life.state === 'verified' ? life.value : life.state}`, evidence: life.evidence }];
  const finish = (state: TaskResult['state']): TaskResult => ({
    id: spec.id,
    task: { sourceId: item.sourceId, sourceRef: item.sourceRef, kind: item.kind },
    state,
    reasons,
    evidence: sortedUnique(reasons.flatMap((x) => x.evidence)),
  });
  if (life.state === 'verified' && life.value === 'complete') return finish('done');
  if (life.state !== 'verified' || life.value !== 'pending') return finish('unknown');
  let blocked = false;
  let unknown = false;
  for (const r of [...spec.requirements].sort((a, b) => cmp(a.id, b.id))) {
    const { fact, reason } = requirementReason(r, visible);
    if (fact.state !== 'verified') unknown = true;
    else if (fact.value !== r.expected) blocked = true;
    reasons.push(reason);
  }
  return finish(blocked ? 'blocked' : unknown ? 'unknown' : 'ready');
}

export function evaluate(projection: MemoryProjection, input: ReasoningInput): ReasoningResult {
  const meta = {
    fingerprint: projection.fingerprint,
    policyVersion: projection.policyVersion,
    reasoningPolicyVersion: REASONING_POLICY_VERSION,
    specVersion: specVersionOf(input),
  };
  const refuse = (refusal: 'cycle' | 'invalid-spec'): ReasoningResult => ({ kind: 'invalid-input', refusal, selected: null, tasks: [], ...meta });
  if (!isValidInput(input)) return refuse('invalid-spec');
  const visible = new Map(projection.items.map((i) => [keyOf({ sourceId: i.sourceId, sourceRef: i.sourceRef, kind: i.kind }), i]));
  if (hasCycle(input.tasks, visible)) return refuse('cycle');
  const tasks = [...input.tasks].sort((a, b) => cmp(a.id, b.id)).map((t) => classify(t, visible));
  const selected = tasks.find((t) => t.state === 'ready')?.id ?? null;
  const kind = selected ? 'recommended' : tasks.some((t) => t.state === 'unknown') ? 'insufficient-evidence' : 'no-ready-task';
  return { kind, selected, tasks, ...meta };
}
