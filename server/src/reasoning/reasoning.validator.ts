// Independent validator (BACK-107 T6), adapted from the COG-01 research validator. It never calls the
// evaluator: it finds cycles by Kahn ordering instead of DFS, looks items up and classifies tasks with
// its own code, and accepts a candidate only if it is canonically equal to the result it recomputed.
// It shares only the contract with the evaluator: the input types, input validation and the value table.
// The comparison walks the expected result, never the candidate, so a huge or hostile candidate costs
// no more than the answer itself (COG-08 review).
import type { MemoryProjection } from '../memory/memory.types';
import { APPROVAL_DETAIL, isValidInput, REASONING_POLICY_VERSION, specVersionOf, valueOf } from './reasoning.rules';
import type { ReasoningInput, Reason, TaskResult } from './reasoning.types';

const order = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1);
const ids = (xs: readonly string[]): string[] => [...new Set(xs)].sort(order);

export function validateResult(projection: MemoryProjection, input: ReasoningInput, candidate: unknown): boolean {
  try {
    return sameData(candidate, expected(projection, input));
  } catch {
    return false;
  }
}

/**
 * Plain-data equality bounded by `want`. A candidate must be plain JSON data: own data properties only
 * (no accessors, so no getter runs), exactly the expected keys, and arrays that are dense with nothing
 * but their indexes and `length` (so no extra property or `toJSON` hook). COG-08 reviews.
 */
function sameData(got: unknown, want: unknown): boolean {
  if (want === null || typeof want !== 'object') return got === want;
  if (got === null || typeof got !== 'object') return false;
  if (Array.isArray(want)) {
    // The standard prototype only: an inherited `toJSON` would change what the result serializes to.
    if (!Array.isArray(got) || Object.getPrototypeOf(got) !== Array.prototype || got.length !== want.length) return false;
    if (Reflect.ownKeys(got).length !== want.length + 1) return false; // indexes + length, nothing else
    for (let i = 0; i < want.length; i++) if (!sameValue(got, i, want[i])) return false;
    return true;
  }
  if (Array.isArray(got) || Object.getPrototypeOf(got) !== Object.prototype) return false;
  const wantKeys = Object.keys(want);
  if (Reflect.ownKeys(got).length !== wantKeys.length) return false;
  for (const k of wantKeys) {
    const w = (want as Record<string, unknown>)[k];
    // An absent optional field in the expected result must be absent in the candidate too.
    if (w === undefined || !sameValue(got, k, w)) return false;
  }
  return true;
}

/** Compares one own data property, reading its descriptor so an accessor is refused, never run. */
function sameValue(holder: object, key: string | number, want: unknown): boolean {
  const d = Object.getOwnPropertyDescriptor(holder, key);
  return d !== undefined && 'value' in d && d.enumerable === true && sameData(d.value, want);
}

function expected(projection: MemoryProjection, input: ReasoningInput): unknown {
  const head = {
    fingerprint: projection.fingerprint,
    policyVersion: projection.policyVersion,
    reasoningPolicyVersion: REASONING_POLICY_VERSION,
    specVersion: specVersionOf(input),
  };
  if (!isValidInput(input)) return { ...head, kind: 'invalid-input', refusal: 'invalid-spec', selected: null, tasks: [] };

  // One pass over the projection: every lookup below is a map read, not a scan (COG-08 review 4).
  const keyOf = (sourceId: string, sourceRef: string, kind: string) => JSON.stringify([sourceId, sourceRef, kind]);
  const index = new Map<string, (typeof projection.items)[number]>();
  for (const i of projection.items) index.set(keyOf(i.sourceId, i.sourceRef, i.kind), i);
  const lookup = (sourceId: string, sourceRef: string, kind: string) => index.get(keyOf(sourceId, sourceRef, kind));
  const seen = (t: { sourceId: string; sourceRef: string; kind: string }) => lookup(t.sourceId, t.sourceRef, t.kind) !== undefined;

  // Kahn: repeatedly remove visible tasks whose visible task dependencies are all removed.
  const graphTasks = input.tasks.filter((t) => seen(t.task));
  const depsOf = (id: string): string[] => {
    const t = graphTasks.find((x) => x.id === id)!;
    return t.requirements
      .filter((r) => r.kind === 'dependency')
      .flatMap((r) => graphTasks.filter((o) => o.task.sourceId === r.target!.sourceId && o.task.sourceRef === r.target!.sourceRef && o.task.kind === r.target!.kind).map((o) => o.id));
  };
  const left = new Set(graphTasks.map((t) => t.id));
  let progress = true;
  while (left.size && progress) {
    const free = [...left].filter((id) => depsOf(id).every((d) => !left.has(d)));
    free.forEach((id) => left.delete(id));
    progress = free.length > 0;
  }
  if (left.size) return { ...head, kind: 'invalid-input', refusal: 'cycle', selected: null, tasks: [] };

  const fact = (t: { sourceId: string; sourceRef: string; kind: string } | undefined) => {
    const item = t ? lookup(t.sourceId, t.sourceRef, t.kind) : undefined;
    if (!item) return { state: 'missing', value: 'unknown', evidence: [] as string[] };
    const evidence = item.current ? ids([item.current.firstEvidenceId, item.current.lastEvidenceId]) : [];
    if (item.status !== 'verified' || !item.current) return { state: item.status as string, value: 'unknown', evidence };
    const value = valueOf(item.kind, item.current.payload);
    return value === null ? { state: 'no-value', value: 'unknown', evidence } : { state: 'verified', value: value as string, evidence };
  };

  const tasks: TaskResult[] = [...input.tasks].sort((a, b) => order(a.id, b.id)).map((spec) => {
    const item = lookup(spec.task.sourceId, spec.task.sourceRef, spec.task.kind);
    if (!item) return { id: spec.id, task: null, state: 'unknown', reasons: [{ code: 'task-missing', evidence: [] }], evidence: [] };
    const life = fact(spec.task);
    const reasons: Reason[] = [{ code: 'lifecycle-' + (life.state === 'verified' ? life.value : life.state), evidence: life.evidence }];
    let state: TaskResult['state'];
    if (life.state === 'verified' && life.value === 'complete') state = 'done';
    else if (life.state === 'verified' && life.value === 'pending') {
      const rows = [...spec.requirements].sort((a, b) => order(a.id, b.id)).map((r) => ({ r, f: r.kind === 'approval' ? null : fact(r.target) }));
      for (const { r, f } of rows) {
        if (!f) reasons.push({ code: 'approval-missing', requirement: r.id, evidence: [], detail: APPROVAL_DETAIL });
        else reasons.push({ code: r.kind + '-' + (f.state !== 'verified' ? f.state : f.value === r.expected ? 'satisfied' : 'unsatisfied'), requirement: r.id, evidence: f.evidence });
      }
      const bad = rows.some(({ r, f }) => f !== null && f.state === 'verified' && f.value !== r.expected);
      const gap = rows.some(({ f }) => f === null || f.state !== 'verified');
      state = bad ? 'blocked' : gap ? 'unknown' : 'ready';
    } else state = 'unknown';
    return { id: spec.id, task: { sourceId: item.sourceId, sourceRef: item.sourceRef, kind: item.kind }, state, reasons, evidence: ids(reasons.flatMap((x) => x.evidence)) };
  });

  const ready = tasks.filter((t) => t.state === 'ready').map((t) => t.id).sort(order);
  const selected = ready[0] ?? null;
  const kind = selected ? 'recommended' : tasks.some((t) => t.state === 'unknown') ? 'insufficient-evidence' : 'no-ready-task';
  return { ...head, kind, selected, tasks };
}
