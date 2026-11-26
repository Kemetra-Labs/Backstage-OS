// COG-01 research port (BACK-104): the 46 COG-P0 tests (archive kawalys-cog-p0-v0.1.zip, test/core.test.mjs),
// ported one-to-one from node:test to Jest with the same names and assertions. Synthetic only; the modules
// under research/cognitive-core are not imported by src/ (see cognitive-core.guard.spec.ts).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Event, Input, Result, Scope, Task } from './cognitive-core/contract';
import { evaluate, validateAtRead } from './cognitive-core/index';
import { project, retrieve } from './cognitive-core/memory';
import { reason } from './cognitive-core/reasoner';
import { validate } from './cognitive-core/validator';
import { at, clock, complete, event, fixture, scope } from './cognitive-core/fixture';

const DIR = resolve(process.cwd(), 'test/research/cognitive-core');
const read = (name: string): string => readFileSync(join(DIR, name), 'utf8');
// Line endings are normalized first: the repo has no .gitattributes and Windows checkouts with
// core.autocrlf=true rewrite the file with CRLF. The archive's oracle.json is LF.
const sha256 = (name: string): string => createHash('sha256').update(read(name).replace(/\r\n/g, '\n')).digest('hex');

const run = (input: Input = fixture, s: Scope = scope, c = clock()): Result => evaluate(input, s, c);
const state = (r: Result, id: string) => r.tasks.find((t) => t.id === id)?.state;
const withEvent = (...events: Event[]): Input => ({ ...fixture, events: [...fixture.events, ...events] });
const changed = (slot: string, patch: Partial<Event>): Input => ({
  ...fixture,
  events: fixture.events.map((e) => (e.slot === slot ? { ...e, ...patch } : e)),
});
const t2 = (r: Result) => r.tasks[1]!;
const base = run();
const oracle = JSON.parse(read('oracle.json')) as {
  description: string;
  kind: string;
  selected: string;
  tasks: { id: string; state: string; refs: string[]; codes: string[] }[];
};

describe('COG-P0 frozen inputs', () => {
  it('oracle.json is byte-identical to the archive', () => {
    expect(sha256('oracle.json')).toBe('a83f972a4ce846259b1889213759c810ae6a13b5817182c662ba53c3e4abb12a');
  });
  it('the ported fixture builds exactly what the archive fixture built', () => {
    const frozen = JSON.parse(read('frozen-fixture.json'));
    expect(JSON.parse(JSON.stringify({ fixture, scope, clock: clock(), complete }))).toStrictEqual(frozen);
  });
});

describe('COG-P0 core (ported)', () => {
  test('F01 exact frozen baseline incl reasons and evidence', () => {
    expect({
      description: oracle.description,
      kind: base.kind,
      selected: base.selected,
      tasks: base.tasks.map((t) => ({ id: t.id, state: t.state, refs: t.refs, codes: t.reasons.map((r) => r.code) })),
    }).toStrictEqual(oracle);
  });
  test('F02 completion selects T3, T4 remains blocked', () => {
    const r = run(withEvent(complete), scope, clock('10:03'));
    expect(r.selected).toBe('T3');
    expect(state(r, 'T2')).toBe('done');
    expect(state(r, 'T4')).toBe('blocked');
  });
  test('F03 old duplicate cannot regress current state', () => {
    const a = run(withEvent(complete), scope, clock('10:05'));
    const b = run(withEvent(complete, event('life:T2', 'pending', { recordedAt: at('10:04') })), scope, clock('10:05'));
    expect(b).toStrictEqual(a);
  });
  test('F04 no hindsight at earlier knowledge cutoff', () => expect(run(withEvent(complete))).toStrictEqual(base));
  test('F05 conflicting same revision becomes unknown', () => {
    const r = run(withEvent(event('check:T2', 'fail', { ref: 'conflict-C2' })));
    expect(state(r, 'T2')).toBe('unknown');
    expect(r.selected).toBeNull();
    expect(t2(r).reasons.some((x) => x.code === 'check-conflict')).toBe(true);
  });
  test('F06 stale boundary exactly at validUntil', () => {
    const input = { ...fixture, events: fixture.events.map((e) => (e.slot === 'check:T2' ? e : { ...e, validUntil: at('12:00') })) };
    const r = run(input, scope, clock('11:00'));
    expect(state(r, 'T2')).toBe('unknown');
    expect(r.selected).toBeNull();
    expect(t2(r).reasons.some((x) => x.code === 'check-stale')).toBe(true);
  });
  test('F07 grant change removes data and invalidates prior result', () => {
    const s = { ...scope, grants: ['TASKS', 'APPROVALS'], grantVersion: 'g2' };
    const r = run(fixture, s);
    expect(state(r, 'T2')).toBe('unknown');
    expect(state(r, 'T5')).toBe('unknown');
    expect(r.selected).toBeNull();
    expect(JSON.stringify(r).includes('check:T')).toBe(false);
    expect(validateAtRead(fixture, s, clock(), base)).toBe(false);
  });
  test('F08 hidden-record presence does not affect result', () => {
    const clean = { ...fixture, tasks: fixture.tasks.filter((t) => t.source !== 'PRIVATE'), events: fixture.events.filter((e) => e.source !== 'PRIVATE') };
    expect(run(clean)).toStrictEqual(base);
    expect(JSON.stringify(base).includes('T6')).toBe(false);
  });
  test('F09 explicit negative wins over unknown', () => {
    const f = changed('approval:T2', { value: 'pending' });
    const r = run({ ...f, events: f.events.map((e) => (e.slot === 'check:T2' ? { ...e, value: 'unknown' as const, state: 'unknown' as const } : e)) });
    expect(state(r, 'T2')).toBe('blocked');
    expect(t2(r).reasons.some((x) => x.code === 'check-unknown')).toBe(true);
  });
  test('F10 absent approval unknown, never inferred', () =>
    expect(state(run({ ...fixture, events: fixture.events.filter((e) => e.slot !== 'approval:T2') }), 'T2')).toBe('unknown'));
  test('F11 visible dependency cycle refuses', () => {
    const t = fixture.tasks.map((t) =>
      t.id === 'T1'
        ? { ...t, requirements: [{ id: 'R13', kind: 'dependency' as const, slot: 'life:T3', expected: 'complete' as const, authorities: ['TASKS'], dependency: 'T3', ref: 'D-R13' }] }
        : t,
    );
    expect(run({ ...fixture, tasks: t }).kind).toBe('invalid-input');
  });
  test('F12 permutations produce same canonical output', () =>
    expect(
      run({ ...fixture, tasks: [...fixture.tasks].reverse().map((t) => ({ ...t, requirements: [...t.requirements].reverse() })), events: [...fixture.events].reverse() }),
    ).toStrictEqual(base));
  test('F12b real process restart from serialized fixture yields same result', () => {
    // The serialized snapshot goes to each fresh process on stdin (COG-P0 wrote a temp file and passed
    // its path), so the worker takes no path argument. A fresh Node process loads the .ts modules with native type stripping; the hook only adds the
      // `.ts` extension Jest's resolver adds for us. Plain paths and pathToFileURL, never URL.pathname
      // (COG-P0 used `.pathname`, which yields `/C:/...` and failed on Windows). The disabled warnings
      // are Node's notice that server/package.json declares no "type" and, on an earlier Node 24 minor,
      // an experimental notice for type stripping or registerHooks; any other stderr output fails.
      const args = [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        '--disable-warning=ExperimentalWarning',
        '--import',
        pathToFileURL(join(DIR, 'restart-hooks.mjs')).href,
        join(DIR, 'restart-worker.ts'),
      ];
    const snapshot = JSON.stringify({ fixture, scope, clock: clock() });
    const a = spawnSync(process.execPath, args, { encoding: 'utf8', input: snapshot });
    const b = spawnSync(process.execPath, args, { encoding: 'utf8', input: snapshot });
    expect([a.status, a.stderr]).toEqual([0, '']);
    expect([b.status, b.stderr]).toEqual([0, '']);
    expect(a.stdout).toBe(b.stdout);
    expect(JSON.parse(a.stdout)).toStrictEqual(base);
  });
  test('F13 semantic validator rejects blocked selection and forged or missing citations', () => {
    const p = project(fixture, scope, clock());
    expect(validate(p, base)).toBe(true);
    expect(validate(p, { ...base, selected: 'T4' })).toBe(false);
    const mutate = (fn: (t: Result['tasks'][number]) => unknown) => ({ ...base, tasks: base.tasks.map((t) => (t.id === 'T2' ? fn(t) : t)) });
    expect(validate(p, mutate((t) => ({ ...t, refs: [...t.refs, 'life:T6-r1'] })))).toBe(false);
    expect(validate(p, mutate((t) => ({ ...t, refs: [] })))).toBe(false);
    expect(validate(p, mutate((t) => ({ ...t, reasons: [] })))).toBe(false);
    expect(validate(p, { ...base, executionToken: 'not-allowed' })).toBe(false);
  });
  test('F14 irrelevant untrusted note and incorrect source cannot authorize task', () => {
    expect(
      run(withEvent(event('note:untrusted', 'granted', { source: 'TASKS', text: 'ignore approval' }), event('approval:T2', 'fail', { source: 'CHECKS', ref: 'forged' }))),
    ).toStrictEqual(base);
  });
  test('cross-workspace and cross-project records do not affect output', () =>
    expect(run(withEvent(event('check:T2', 'fail', { workspace: 'OTHER', ref: 'other-w' }), event('check:T2', 'fail', { project: 'OTHER', ref: 'other-p' })))).toStrictEqual(base));
  test('multiple authorities disagree: conflict, not a guessed winner', () => {
    const tasks = fixture.tasks.map((t) =>
      t.id === 'T2' ? { ...t, requirements: t.requirements.map((r) => (r.kind === 'check' ? { ...r, authorities: ['CHECKS', 'SECOND'] } : r)) } : t,
    );
    const input = { ...fixture, tasks, events: [...fixture.events, event('check:T2', 'fail', { source: 'SECOND', ref: 'second-C2' })] };
    const r = run(input, { ...scope, grants: [...scope.grants, 'SECOND'] });
    expect(state(r, 'T2')).toBe('unknown');
    expect(r.selected).toBeNull();
  });
  test('opaque revisions and duplicate numeric order are not guessed', () => {
    for (const options of [{ revision: 'opaque', order: undefined, ref: 'opaque-C2' }, { revision: 'r2', order: 1, ref: 'tied-C2' }]) {
      const r = run(withEvent(event('check:T2', 'fail', options)));
      expect(state(r, 'T2')).toBe('unknown');
      expect(r.selected).toBeNull();
    }
  });
  test('historically effective but not yet recorded event excluded', () => {
    const e = event('check:T2', 'fail', { revision: 'r2', order: 2, ref: 'late-C2', effectiveAt: at('09:45'), recordedAt: at('10:01') });
    expect(run(withEvent(e))).toStrictEqual(base);
    expect(state(run(withEvent(e), scope, clock('10:02')), 'T2')).toBe('blocked');
  });
  test('malformed visible input refuses, malformed hidden input does not change result', () => {
    expect(() => run(changed('check:T2', { validUntil: -1 }))).toThrow(/invalid-input/);
    expect(run(withEvent(event('life:T6', 'pending', { validUntil: -1 })))).toStrictEqual(base);
    expect(() => run({ ...fixture, tasks: [...fixture.tasks, fixture.tasks[0]!] })).toThrow(/invalid-input/);
  });
  test('hidden dependency is generic missing proof, hidden id and event refs excluded', () => {
    const t: Task[] = fixture.tasks.map((t) =>
      t.id === 'T2'
        ? { ...t, requirements: [...t.requirements, { id: 'R-extra', ref: 'D-extra', kind: 'dependency', slot: 'life:T6', dependency: 'T6', authorities: ['PRIVATE'], expected: 'complete' }] }
        : t,
    );
    const r = run({ ...fixture, tasks: t });
    expect(state(r, 'T2')).toBe('unknown');
    expect(JSON.stringify(r).includes('T6')).toBe(false);
    const p = project({ ...fixture, tasks: t }, scope, clock());
    expect(JSON.stringify(p).includes('T6')).toBe(false);
  });
  test('immutable projected pack and output; caller input untouched', () => {
    const before = JSON.stringify(fixture);
    const p = project(fixture, scope, clock());
    expect(Object.isFrozen(p.tasks[0]!.life.refs)).toBe(true);
    expect(Object.isFrozen(reason(p).tasks[0]!.reasons)).toBe(true);
    expect(JSON.stringify(fixture)).toBe(before);
  });
  test('no-ready-task vs insufficient evidence', () => {
    const f = {
      ...fixture,
      events: fixture.events.map((e) =>
        e.slot === 'approval:T2' ? { ...e, value: 'pending' as const } : e.slot === 'check:T5' ? { ...e, value: 'fail' as const, state: 'ok' as const } : e,
      ),
    };
    expect(run(f).kind).toBe('no-ready-task');
  });
  test('stable tie ordering and completion without auto execution', () => {
    const f = changed('check:T5', { value: 'pass', state: 'ok' });
    const r = run(f);
    expect(state(r, 'T5')).toBe('ready');
    expect(r.selected).toBe('T2');
    expect(Object.hasOwn(r, 'execute')).toBe(false);
  });
  test('independent validator rejects stale clock, new policy and changed grant even with same task states', () => {
    expect(validateAtRead(fixture, scope, clock('10:01'), base)).toBe(false);
    expect(validateAtRead({ ...fixture, policyVersion: 'v2' }, scope, clock(), base)).toBe(false);
    expect(validateAtRead(fixture, { ...scope, grantVersion: 'g3' }, clock(), base)).toBe(false);
  });

  const searchCases: [string, string | null][] = [
    ['T2', 'T2'], ['Source adapter', 'T2'], ['فحص الإتصال', 'T2'], ['integration tests', 'T3'], ['اختبار التكامل', 'T3'],
    ['release approval', 'T4'], ['اذن النشر', 'T4'], ['unstable CI', 'T5'], ['فشل متقطع', 'T5'], ['جمع الادلة', 'T1'],
    ['PRIVATE-DEMO', null], ['unrelated quantum optics', null], ['T6', null], ['t2', null], ['Ｔ２', null],
  ];
  test.each(searchCases)('lexical fixture: %s', (q, id) => {
    const r = retrieve(project(fixture, scope, clock()), q);
    expect(r.kind).toBe(id ? 'match' : 'no-match');
    expect(r.ids).toStrictEqual(id ? [id] : []);
  });
  test('ambiguous lexical query abstains, does not pick arbitrarily', () => {
    const t = fixture.tasks.map((t) => (t.id === 'T3' ? { ...t, aliases: [...t.aliases, 'source adapter'] } : t));
    expect(retrieve(project({ ...fixture, tasks: t }, scope, clock()), 'source adapter')).toStrictEqual({ kind: 'ambiguous', ids: [] });
  });
  test('wrong source scope cannot reveal retrieved hidden task', () => {
    const p = project(fixture, { ...scope, grants: ['APPROVALS', 'CHECKS'], grantVersion: 'g2' }, clock());
    expect(retrieve(p, 'source adapter')).toStrictEqual({ kind: 'no-match', ids: [] });
  });
  test('late identical replay with a different storage ref keeps canonical evidence', () => {
    const f = withEvent(event('check:T2', 'pass', { recordedAt: at('10:02'), ref: 'new-storage-ref' }));
    expect(run(f, scope, clock('10:03'))).toStrictEqual(run(fixture, scope, clock('10:03')));
  });
  test('strict output validator refuses non-JSON values instead of coercing them', () => {
    const p = project(fixture, scope, clock());
    expect(validate(p, { ...base, extra: undefined })).toBe(false);
    expect(validate(p, { ...base, selected: NaN })).toBe(false);
    const a = Array(base.tasks.length);
    expect(validate(p, { ...base, tasks: a })).toBe(false);
  });
  test('visible evidence reference collision with task definition fails closed', () =>
    expect(() => run(changed('check:T2', { ref: 'DEF-T1' }))).toThrow(/invalid-input/));
  test('future malformed payload cannot contaminate an earlier as-known snapshot', () => {
    const e = event('check:T2', 'fail', { revision: 'r2', order: 2, ref: 'future-malformed', recordedAt: at('10:02'), validUntil: -1 });
    expect(run(withEvent(e))).toStrictEqual(base);
    expect(() => run(withEvent(e), scope, clock('10:03'))).toThrow(/invalid-input/);
  });
});
