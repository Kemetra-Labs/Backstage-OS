// Mission Replay logic. Playback is a view-state clock: it moves a cursor over fixed synthetic events and nothing else.
import { STAGES, type ReplayEvent, type ReplayStage } from '../../contract/world';

/** Replay milliseconds per event at 1x. Events are evenly spaced in replay time; real clock times are labels. */
export const STEP_MS = 1500;
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export const totalMs = (events: readonly unknown[]): number => Math.max(0, events.length - 1) * STEP_MS;

export const clampMs = (ms: number, events: readonly unknown[]): number => Math.min(totalMs(events), Math.max(0, ms));

/** Index of the last event at or before the cursor. */
export function indexAt(ms: number, events: readonly unknown[]): number {
  if (events.length === 0) return -1;
  return Math.min(events.length - 1, Math.max(0, Math.floor(clampMs(ms, events) / STEP_MS + 1e-9)));
}

export const msOfIndex = (i: number): number => i * STEP_MS;

const rank = (s: ReplayStage): number => STAGES.indexOf(s);

/** The furthest stage reached up to and including event `idx`. */
export function stageAt(idx: number, events: readonly ReplayEvent[]): ReplayStage {
  let best: ReplayStage = 'observed';
  for (let i = 0; i <= idx && i < events.length; i += 1) {
    const e = events[i]!;
    if (rank(e.stage) > rank(best)) best = e.stage;
  }
  return best;
}

export type MilestoneState = 'done' | 'progress' | 'todo';
export interface Milestone {
  readonly key: 'signal' | 'evidence' | 'validate' | 'decide' | 'close';
  readonly state: MilestoneState;
  readonly at: string | null;
}

/** Milestones follow what has been replayed so far. Deciding and closing stay open: Kawalys never decides. */
export function milestonesAt(idx: number, events: readonly ReplayEvent[]): readonly Milestone[] {
  const firstOf = (stage: ReplayStage): number => events.findIndex((e) => e.stage === stage);
  const clock = (i: number): string | null => (i >= 0 && i <= idx ? events[i]!.clock : null);
  const ing = firstOf('ingested');
  const hyp = firstOf('hypothesis');
  const gap = events.findIndex((e) => e.kind === 'gap');
  return [
    { key: 'signal', state: idx >= 0 ? 'done' : 'todo', at: clock(0) },
    { key: 'evidence', state: ing >= 0 && idx >= ing ? 'done' : idx >= 0 ? 'progress' : 'todo', at: clock(ing) },
    { key: 'validate', state: hyp >= 0 && idx >= hyp ? 'progress' : gap >= 0 && idx >= gap ? 'progress' : 'todo', at: clock(hyp) },
    { key: 'decide', state: 'todo', at: null },
    { key: 'close', state: 'todo', at: null },
  ];
}

/** Evidence gaps announced up to and including `idx`. */
export const gapsAt = (idx: number, events: readonly ReplayEvent[]): readonly ReplayEvent[] =>
  events.filter((e, i) => e.kind === 'gap' && i <= idx);

/** Advance the cursor by wall-clock `dt` milliseconds at `speed`, stopping at the end. */
export function advance(ms: number, dt: number, speed: Speed, events: readonly unknown[]): { ms: number; ended: boolean } {
  const next = clampMs(ms + dt * speed, events);
  return { ms: next, ended: next >= totalMs(events) };
}
