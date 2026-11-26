// COG-FIX-01 synthetic fixture (BACK-104), ported from COG-P0 fixtures/build.mjs (archive
// kawalys-cog-p0-v0.1.zip, SHA-256 b67f5545...d78ae5). Behaviour-preserving: only types were added.
// Timestamps are UTC epoch milliseconds. Entirely synthetic; no real task, source or person.
import type { Event, Input, Requirement, Scope, Task, Value, Clock } from './contract';

export const at = (s: string): number => Date.parse('2026-01-01T' + s + ':00Z');
export const clock = (t = '10:00'): Clock => ({ effectiveAt: at(t), knownAt: at(t), evaluationAt: at(t) });
export const scope: Scope = { workspace: 'W', project: 'P', grants: ['TASKS', 'APPROVALS', 'CHECKS'], grantVersion: 'g1' };

const req = (
  id: string,
  kind: Requirement['kind'],
  slot: string,
  expected: Value,
  authorities: string[],
  dependency?: string,
): Requirement => ({ id, kind, slot, expected, authorities, ref: 'D-' + id, ...(dependency ? { dependency } : {}) });

const task = (id: string, title: string, aliases: string[], requirements: Requirement[] = [], source = 'TASKS'): Task => ({
  workspace: 'W',
  project: 'P',
  source,
  id,
  ref: 'DEF-' + id,
  title,
  aliases,
  requirements,
});

/** Options may carry fields the contract does not know (an untrusted note's `text`): they must be ignored. */
export type EventOptions = Partial<{ -readonly [K in keyof Event]: Event[K] }> & { text?: string };

export const event = (slot: string, value: Value, options: EventOptions = {}): Event => ({
  workspace: 'W',
  project: 'P',
  source: slot.startsWith('approval:') ? 'APPROVALS' : slot.startsWith('check:') ? 'CHECKS' : slot === 'life:T6' ? 'PRIVATE' : 'TASKS',
  slot,
  value,
  state: value === 'unknown' ? 'unknown' : 'ok',
  revision: 'r1',
  order: 1,
  ref: slot + '-r1',
  effectiveAt: at('09:00'),
  recordedAt: at('09:30'),
  validUntil: at('11:00'),
  ...options,
});

const tasks: Task[] = [
  task('T1', 'Evidence collection جمع الأدلة', ['collect evidence', 'جمع الدليل']),
  task('T2', 'Source adapter فحص الاتصال', ['source-read', 'فحص المصدر'], [
    req('R21', 'dependency', 'life:T1', 'complete', ['TASKS'], 'T1'),
    req('R22', 'approval', 'approval:T2', 'granted', ['APPROVALS']),
    req('R23', 'check', 'check:T2', 'pass', ['CHECKS']),
  ]),
  task('T3', 'Integration test اختبار التكامل', ['integration tests', 'اختبارات التكامل'], [
    req('R31', 'dependency', 'life:T2', 'complete', ['TASKS'], 'T2'),
  ]),
  task('T4', 'Deployment review مراجعة النشر', ['release approval', 'إذن النشر', 'موافقة النشر'], [
    req('R41', 'dependency', 'life:T3', 'complete', ['TASKS'], 'T3'),
    req('R42', 'approval', 'approval:T4', 'granted', ['APPROVALS']),
  ]),
  task('T5', 'Flaky CI فشل متقطع في الاختبارات', ['unstable CI', 'فشل متقطع'], [req('R51', 'check', 'check:T5', 'pass', ['CHECKS'])]),
  task('T6', 'Restricted work', ['PRIVATE-DEMO'], [], 'PRIVATE'),
];

export const fixture: Input = {
  fixtureVersion: 'COG-FIX-01-v0.1',
  policyVersion: 'readiness-v0.1',
  tasks,
  events: [
    ...tasks.map((t) => event('life:' + t.id, t.id === 'T1' ? 'complete' : 'pending')),
    event('approval:T2', 'granted'),
    event('approval:T4', 'pending'),
    event('check:T2', 'pass'),
    event('check:T5', 'unknown'),
  ],
};

export const complete: Event = event('life:T2', 'complete', {
  revision: 'r2',
  order: 2,
  ref: 'life:T2-r2',
  effectiveAt: at('10:01'),
  recordedAt: at('10:02'),
});
