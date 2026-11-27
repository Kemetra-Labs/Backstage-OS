// COG-04 reasoning contract (BACK-107 S1). See docs/planning/BACK-107/cog-04-design.md.
// Advisory only: a result never executes, approves or schedules anything.
import type { ItemIdentity } from '../retrieval/retrieval.types';

export type FactValue = 'complete' | 'pending' | 'open' | 'closed' | 'draft' | 'granted' | 'unknown';
export type FactState = 'verified' | 'stale' | 'unknown' | 'conflict' | 'insufficient-history' | 'no-value' | 'missing';

export interface RequirementSpec {
  readonly id: string;
  readonly kind: 'dependency' | 'check' | 'approval';
  readonly target?: ItemIdentity;
  readonly expected?: FactValue;
}

export interface TaskSpec {
  readonly id: string;
  readonly task: ItemIdentity;
  readonly requirements: readonly RequirementSpec[];
}

export interface ReasoningInput {
  readonly specVersion: string;
  readonly tasks: readonly TaskSpec[];
}

export interface Fact {
  readonly state: FactState;
  readonly value: FactValue;
  /** Evidence ids of the visible item that decided the fact; empty when missing. */
  readonly evidence: readonly string[];
}

export interface Reason {
  readonly code: string;
  readonly requirement?: string;
  readonly evidence: readonly string[];
  readonly detail?: string;
}

export type TaskState = 'done' | 'ready' | 'blocked' | 'unknown';

export interface TaskResult {
  readonly id: string;
  /** Null when the task's own item is not visible (hidden or nonexistent: indistinguishable). */
  readonly task: ItemIdentity | null;
  readonly state: TaskState;
  readonly reasons: readonly Reason[];
  readonly evidence: readonly string[];
}

export interface ReasoningResult {
  readonly kind: 'recommended' | 'no-ready-task' | 'insufficient-evidence' | 'invalid-input';
  readonly refusal?: 'cycle' | 'invalid-spec';
  readonly selected: string | null;
  readonly tasks: readonly TaskResult[];
  readonly fingerprint: string;
  readonly policyVersion: string;
  readonly reasoningPolicyVersion: string;
  readonly specVersion: string | null;
}
