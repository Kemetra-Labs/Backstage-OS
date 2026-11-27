// COG-07 (BACK-110) shadow view model. Reads the committed cognitive-core fixture (src/fixture/shadow-cognition.json,
// kept equal to real engine output by server/test/shadow/shadow-fixture.spec.ts). No request is made. Anything malformed,
// or a reasoning result the independent validator did not accept, is refused as a whole: never shown, never guessed.

export const HIT_STATUSES = ['verified', 'stale', 'unknown', 'conflict', 'insufficient-history', 'no-value'] as const;
export const SEARCH_OUTCOMES = ['match', 'ambiguous', 'no-match', 'invalid-query'] as const;
export const TASK_STATES = ['done', 'ready', 'blocked', 'unknown'] as const;
export const REASONING_KINDS = ['recommended', 'no-ready-task', 'insufficient-evidence', 'invalid-input'] as const;

export type HitStatus = (typeof HIT_STATUSES)[number];
export type SearchOutcome = (typeof SEARCH_OUTCOMES)[number];
export type TaskState = (typeof TASK_STATES)[number];
export type ReasoningKind = (typeof REASONING_KINDS)[number];

export interface ShadowHit {
  readonly title: string;
  readonly kind: string;
  readonly sourceRef: string;
  readonly status: HitStatus;
  readonly tier: string;
}
export interface ShadowSearch {
  readonly query: string;
  readonly outcome: SearchOutcome;
  readonly totalMatches: number;
  readonly hits: readonly ShadowHit[];
}
export interface ShadowReason {
  readonly code: string;
  readonly requirement: string | null;
}
export interface ShadowTask {
  readonly id: string;
  readonly sourceRef: string | null;
  readonly state: TaskState;
  readonly reasons: readonly ShadowReason[];
}
export type ShadowView =
  | {
      readonly kind: 'ok';
      readonly versions: { readonly memory: string; readonly retrieval: string; readonly reasoning: string };
      readonly searches: readonly ShadowSearch[];
      readonly reasoning: { readonly kind: ReasoningKind; readonly selected: string | null; readonly tasks: readonly ShadowTask[] };
    }
  | { readonly kind: 'invalid' };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => isStr(v) && (list as readonly string[]).includes(v);

class Invalid extends Error {}
const need = <T>(ok: boolean, v: T): T => {
  if (!ok) throw new Invalid();
  return v;
};
const str = (v: unknown): string => need(isStr(v), v as string);
const list = (v: unknown): unknown[] => need(Array.isArray(v), v as unknown[]);
const rec = (v: unknown): Rec => need(isRec(v), v as Rec);

function hit(v: unknown): ShadowHit {
  const h = rec(v);
  return { title: str(h['title']), kind: str(h['kind']), sourceRef: str(h['sourceRef']), status: need(oneOf(HIT_STATUSES, h['status']), h['status'] as HitStatus), tier: str(h['tier']) };
}

function searchOf(v: unknown): ShadowSearch {
  const s = rec(v);
  const total = s['totalMatches'];
  return {
    query: str(s['query']),
    outcome: need(oneOf(SEARCH_OUTCOMES, s['outcome']), s['outcome'] as SearchOutcome),
    totalMatches: need(Number.isInteger(total) && (total as number) >= 0, total as number),
    hits: list(s['hits']).map(hit),
  };
}

function taskOf(v: unknown): ShadowTask {
  const t = rec(v);
  const ref = t['sourceRef'];
  return {
    id: str(t['id']),
    sourceRef: ref === null ? null : str(ref),
    state: need(oneOf(TASK_STATES, t['state']), t['state'] as TaskState),
    reasons: list(t['reasons']).map((r) => {
      const x = rec(r);
      const req = x['requirement'];
      return { code: str(x['code']), requirement: req === null ? null : str(req) };
    }),
  };
}

/** The shadow view, or `invalid` when anything does not match the expected shape. */
export function readShadow(raw: unknown): ShadowView {
  try {
    const r = rec(raw);
    const reasoning = rec(r['reasoning']);
    need(reasoning['validated'] === true, null);
    const selected = reasoning['selected'];
    return {
      kind: 'ok',
      versions: { memory: str(r['memoryPolicyVersion']), retrieval: str(r['retrievalPolicyVersion']), reasoning: str(r['reasoningPolicyVersion']) },
      searches: list(r['searches']).map(searchOf),
      reasoning: {
        kind: need(oneOf(REASONING_KINDS, reasoning['kind']), reasoning['kind'] as ReasoningKind),
        selected: selected === null ? null : str(selected),
        tasks: list(reasoning['tasks']).map(taskOf),
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { kind: 'invalid' };
    throw e;
  }
}
