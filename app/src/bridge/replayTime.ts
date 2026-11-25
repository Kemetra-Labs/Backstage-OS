// BACK-89: explicit time semantics for the replay, before anything is ordered or marked. The replay's clock is when Kawalys
// PROCESSED a signal ("analysed"), in the order it processed them; it is not when the thing happened and not when a source read it.
// A source's read time ("observed") exists only where the event rests on evidence, and it can disagree with the processing order
// (the PR record was read at 13:27 but is processed after the 14:02 failure). "Occurred" is not modelled at all, so it is never
// claimed. An event with no evidence has no observed time: it is shown as not evidenced, never given a time. Pure; reads only the
// persona's authorized world, so a withheld record contributes no row, no time and no gap. Synthetic data only.
import type { ReplayEvent, World } from '../contract/world';

export type OrderStatus = 'consistent' | 'uncertain' | 'unknown';

export interface ReplayTimeRow {
  readonly id: string;
  /** 1-based position in Kawalys's processing order. */
  readonly step: number;
  /** The replay's own clock, HH:MM: when Kawalys processed the event. */
  readonly processedAt: string;
  /** When the evidence behind the event was read by its source (ISO), or null when the event has no readable evidence. */
  readonly observedAt: string | null;
  /**
   * 'unknown': no observed time to compare. 'uncertain': an observed time disagrees with the processing order against another
   * event's observed time, so the processing order must not be read as the order things happened. 'consistent' otherwise.
   */
  readonly order: OrderStatus;
}

export function replayTimeRows(w: Pick<World, 'replay' | 'evidence'>): readonly ReplayTimeRow[] {
  const observed = (e: ReplayEvent): string | null => (e.evidence === null ? null : w.evidence[e.evidence]?.observation?.observedAt ?? null);
  const times = w.replay.map(observed);
  return w.replay.map((e, i) => {
    const at = times[i] ?? null;
    const disagrees = at !== null && times.some((o, j) => o !== null && ((j < i && o > at) || (j > i && o < at)));
    const order: OrderStatus = at === null ? 'unknown' : disagrees ? 'uncertain' : 'consistent';
    return { id: e.id, step: i + 1, processedAt: e.clock, observedAt: at, order };
  });
}
