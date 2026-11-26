// BACK-104 Phase B: an independent oracle for the COG-01 research port. Expected results live in
// oracle-cases.json, hand-authored from the W1 acceptance table, not from the reasoner. This file only
// turns each declarative change into an input and compares. Synthetic only.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Event, Input, Requirement, Result, Scope } from './cognitive-core/contract';
import { evaluate, validateAtRead } from './cognitive-core/index';
import { project } from './cognitive-core/memory';
import { validate } from './cognitive-core/validator';
import { at, clock, event, fixture, scope, type EventOptions } from './cognitive-core/fixture';

type Options = Record<string, string | number | null>;
interface Change {
  addEvents?: { slot: string; value: Event['value']; options?: Options }[];
  removeSlots?: string[];
  patchSlots?: Record<string, Options>;
  patchAllExcept?: { except: string; patch: Options };
  removeSource?: string;
  grants?: string[];
  grantVersion?: string;
  clock?: string;
  addRequirement?: { task: string; requirement: Requirement };
  permute?: boolean;
}
interface Expect {
  sameAs?: string;
  throws?: string;
  kind?: Result['kind'];
  selected?: string | null;
  states?: Record<string, string>;
  codes?: Record<string, string[]>;
  absent?: string[];
  baselineNoLongerValid?: boolean;
}
interface Case { id: string; what: string; change?: Change; expect: Expect }
interface Forgery { id: string; what: string; patch?: Record<string, unknown>; patchTask?: Record<string, { addRef?: string; clearRefs?: boolean }> }

const ORACLE = JSON.parse(readFileSync(join(resolve(process.cwd(), 'test/research/cognitive-core'), 'oracle-cases.json'), 'utf8')) as {
  cases: Case[];
  forgeries: Forgery[];
};
const TIME_FIELDS = new Set(['effectiveAt', 'recordedAt', 'validUntil']);

/** "HH:MM" becomes epoch ms; a literal number is kept (to express malformed values); null means absent. */
function options(o: Options = {}): EventOptions {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = v === null ? undefined : TIME_FIELDS.has(k) && typeof v === 'string' ? at(v) : v;
  return out as EventOptions;
}

function apply(change: Change = {}): { input: Input; scope: Scope; when: ReturnType<typeof clock> } {
  let events = [...fixture.events];
  let tasks = [...fixture.tasks];
  if (change.removeSlots) events = events.filter((e) => !change.removeSlots!.includes(e.slot));
  if (change.patchSlots) events = events.map((e) => (change.patchSlots![e.slot] ? { ...e, ...options(change.patchSlots![e.slot]) } : e));
  if (change.patchAllExcept) events = events.map((e) => (e.slot === change.patchAllExcept!.except ? e : { ...e, ...options(change.patchAllExcept!.patch) }));
  if (change.removeSource) {
    events = events.filter((e) => e.source !== change.removeSource);
    tasks = tasks.filter((t) => t.source !== change.removeSource);
  }
  if (change.addRequirement) {
    const { task, requirement } = change.addRequirement;
    tasks = tasks.map((t) => (t.id === task ? { ...t, requirements: [...t.requirements, requirement] } : t));
  }
  for (const e of change.addEvents ?? []) events.push(event(e.slot, e.value, options(e.options)));
  if (change.permute) {
    tasks = [...tasks].reverse().map((t) => ({ ...t, requirements: [...t.requirements].reverse() }));
    events = [...events].reverse();
  }
  return {
    input: { ...fixture, tasks, events },
    scope: { ...scope, ...(change.grants ? { grants: change.grants } : {}), ...(change.grantVersion ? { grantVersion: change.grantVersion } : {}) },
    when: clock(change.clock ?? '10:00'),
  };
}

const semantic = (r: Result) => ({ kind: r.kind, selected: r.selected, tasks: r.tasks });
const baseline = evaluate(fixture, scope, clock());
const byId = new Map(ORACLE.cases.map((c) => [c.id, c]));

describe('COG-01 independent oracle', () => {
  it('has the cases it was written with', () => {
    expect(ORACLE.cases.length).toBe(24);
    expect(ORACLE.forgeries.length).toBe(5);
  });

  it.each(ORACLE.cases.map((c) => [c.id, c.what, c] as const))('%s: %s', (_id, _what, c) => {
    const { input, scope: s, when } = apply(c.change);
    if (c.expect.throws) {
      expect(() => evaluate(input, s, when)).toThrow(new RegExp(c.expect.throws));
      return;
    }
    const r = evaluate(input, s, when);
    // Hidden-record noninterference holds for every case: T6 and PRIVATE never appear.
    expect(JSON.stringify(r)).not.toMatch(/T6|PRIVATE/);
    for (const text of c.expect.absent ?? []) expect(JSON.stringify(r)).not.toContain(text);

    if (c.expect.sameAs) {
      const ref = byId.get(c.expect.sameAs)!;
      const other = apply(ref.change);
      expect(semantic(r)).toStrictEqual(semantic(evaluate(other.input, other.scope, other.when)));
      return;
    }
    expect(r.kind).toBe(c.expect.kind);
    expect(r.selected).toBe(c.expect.selected);
    expect(Object.fromEntries(r.tasks.map((t) => [t.id, t.state]))).toStrictEqual(c.expect.states);
    for (const [task, codes] of Object.entries(c.expect.codes ?? {})) {
      expect(r.tasks.find((t) => t.id === task)!.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(codes));
    }
    // Consistency check, not an independent one: the allowed set comes from project(), the code under
    // test. It catches a reasoner citing something the projection never supplied.
    const pack = project(input, s, when);
    const allowed = new Set(pack.tasks.flatMap((t) => [t.ref, ...t.life.refs, ...t.requirements.flatMap((q) => [q.ref, ...q.fact.refs])]));
    for (const t of r.tasks) for (const ref of t.refs) expect(allowed.has(ref)).toBe(true);
    if (c.expect.baselineNoLongerValid) expect(validateAtRead(input, s, when, baseline)).toBe(false);
  });

  describe('forged outputs are refused by the independent validator', () => {
    const pack = project(fixture, scope, clock());
    it('accepts the genuine baseline', () => expect(validate(pack, baseline)).toBe(true));
    it.each(ORACLE.forgeries.map((f) => [f.id, f.what, f] as const))('%s: %s', (_id, _what, f) => {
      const tasks = baseline.tasks.map((t) => {
        const p = f.patchTask?.[t.id];
        if (!p) return t;
        return { ...t, refs: p.clearRefs ? [] : [...t.refs, ...(p.addRef ? [p.addRef] : [])] };
      });
      expect(validate(pack, { ...baseline, tasks, ...(f.patch ?? {}) })).toBe(false);
    });
  });
});
