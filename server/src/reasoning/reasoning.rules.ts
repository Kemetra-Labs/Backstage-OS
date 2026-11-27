// Versioned reasoning rules (BACK-107 T1, T2, T3): the shared contract of the evaluator and the
// independent validator. Changing a rule here is a policy change: bump REASONING_POLICY_VERSION.
import type { ItemIdentity } from '../retrieval/retrieval.types';
import type { FactValue, ReasoningInput, RequirementSpec } from './reasoning.types';

/**
 * v2 (2026-11-27, COG-08 review): duplicate task identities refused; `open` needs explicit draft: false.
 * v3 (2026-11-27, second COG-08 review): sparse arrays refused.
 */
export const REASONING_POLICY_VERSION = 'reasoning-v3';
export const MAX_TASKS = 50;
export const MAX_REQUIREMENTS = 20;
export const MAX_ID = 100;
export const APPROVAL_DETAIL = 'approval-evidence-not-wired';

/**
 * The value an item's current revision states (T2). A closed PR is `closed`, never "merged": the
 * evidence has no merge flag. Returns null when the rule yields no value.
 */
export function valueOf(kind: string, payload: Readonly<Record<string, unknown>>): FactValue | null {
  if (kind === 'jira_issue') {
    const c = payload['statusCategory'];
    return c === 'done' ? 'complete' : c === 'new' || c === 'indeterminate' ? 'pending' : null;
  }
  if (kind === 'pull_request') {
    const s = payload['state'];
    if (s === 'closed') return 'closed';
    // A missing or non-boolean draft flag is no evidence of either: unknown is never "open".
    if (s === 'open') return payload['draft'] === true ? 'draft' : payload['draft'] === false ? 'open' : null;
    return null;
  }
  if (kind === 'issue') {
    const s = payload['state'];
    return s === 'open' || s === 'closed' ? s : null;
  }
  return null;
}

/** Which targets and expectations each requirement kind accepts (T1). */
const CHECK_VALUES: Readonly<Record<string, readonly FactValue[]>> = { pull_request: ['open', 'closed', 'draft'], issue: ['open', 'closed'] };

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIdentity = (v: unknown): v is ItemIdentity =>
  isObject(v) && [v['sourceId'], v['sourceRef'], v['kind']].every((s) => typeof s === 'string' && s.length > 0 && s.length <= 500);

function validRequirement(r: unknown): r is RequirementSpec {
  if (!isObject(r) || !isId(r['id'])) return false;
  const target = r['target'];
  if (r['kind'] === 'dependency') return isIdentity(target) && target.kind === 'jira_issue' && r['expected'] === 'complete';
  // Own properties only: a kind such as `constructor` must be refused, not resolved through the prototype.
  if (r['kind'] === 'check') return isIdentity(target) && Object.hasOwn(CHECK_VALUES, target.kind) && CHECK_VALUES[target.kind]!.includes(r['expected'] as FactValue);
  if (r['kind'] === 'approval') return target === undefined && r['expected'] === 'granted';
  return false;
}

const unique = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;
/** Every index an own, populated entry: `every` and `map` skip holes, so a sparse array would slip through. */
const dense = (a: readonly unknown[]): boolean => {
  for (let i = 0; i < a.length; i++) if (!Object.hasOwn(a, i)) return false;
  return true;
};

/** T1: invalid input is refused, never repaired. */
export function isValidInput(input: unknown): input is ReasoningInput {
  if (!isObject(input) || !isId(input['specVersion']) || !Array.isArray(input['tasks']) || input['tasks'].length > MAX_TASKS || !dense(input['tasks'])) return false;
  const tasks = input['tasks'] as unknown[];
  for (const t of tasks) {
    if (!isObject(t) || !isId(t['id']) || !isIdentity(t['task']) || t['task'].kind !== 'jira_issue') return false;
    const reqs = t['requirements'];
    if (!Array.isArray(reqs) || reqs.length > MAX_REQUIREMENTS || !dense(reqs) || !reqs.every(validRequirement)) return false;
    if (!unique(reqs.map((r: RequirementSpec) => r.id))) return false;
  }
  // One spec per task item: a second spec for the same issue could bypass its approval gate or hide a
  // cycle (COG-08 review).
  const identities = tasks.map((t) => {
    const i = (t as { task: ItemIdentity }).task;
    return JSON.stringify([i.sourceId, i.sourceRef, i.kind]);
  });
  return unique(tasks.map((t) => (t as { id: string }).id)) && unique(identities);
}

/** The spec version echoed in a result: only a valid one, else null. */
export const specVersionOf = (input: unknown): string | null => (isObject(input) && isId(input['specVersion']) ? input['specVersion'] : null);
