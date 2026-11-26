// Server-shaped evidence in the Investigation Room (BACK-57, owner decision 2026-11-26, extending the 25 Nov Portfolio
// decision, Jira BACK-57 comment 18848): the BACK-57 adapters (src/api) applied to `GET /investigations/:id` and `GET /decisions`
// bodies. By default both are committed SYNTHETIC fixtures that server/test/evidence/evidence-parity.spec.ts keeps equal to what
// the server's repositories produce. In live mode (BACK-51 P1) the caller passes the bodies live/reads.ts fetched, with
// origin 'live' and the real clock. This file makes no request (src/live/live.guard.test.ts). Pure: the clock is passed in.
//
// Rules: read states only, never health. A record that was not read stays not read, with its reason. A decision is `proposed`
// unless decisionLabel() finds citations AND a link to the owning record (the server stores no such link, so never today).
import { decisionLabel, toEvidenceReference } from '../api/evidence';
import { GITHUB_TTL_SECONDS } from '../api/portfolio';
import { effectiveFreshness, resolveLabel } from '../contract/rules';
import type { DisplayLabel, Persona, SourceAuthority } from '../contract/types';
import type { ReadOrigin } from './githubReadView';
import DECISIONS from '../fixture/decisions-response.json';
import INVESTIGATION from '../fixture/investigation-response.json';

/** The server's fixture clock (evidence-parity.spec.ts NOW): the investigation was opened at this time. */
export const FIXTURE_NOW = new Date('2026-11-25T12:00:00.000Z');

/** What one record shows. `unknown`: read, but with no usable time. Never "healthy". */
export type RecordRead = 'current' | 'stale' | 'unknown' | 'notRead';
/** Why a record was not read: the server state, or no source this view holds an authority for. */
export type NotReadReason = 'error' | 'denied' | 'unknown' | 'noSource';

export interface RecordRow {
  readonly id: string;
  /** The TruthChip label, from the display contract: unread is unknown, a correlation without a written rule is a hypothesis. */
  readonly label: DisplayLabel;
  readonly read: RecordRead;
  /** Set only when the record was not read. */
  readonly reason: NotReadReason | null;
  /** Minutes since the record was observed; null when not read or dated in the future. */
  readonly ageMinutes: number | null;
  /** The server's source reference (e.g. a repository and pull request). Technical only: null for Owner. */
  readonly sourceRef: string | null;
}

export interface DecisionRow {
  readonly id: string;
  /** `approved` only with citations and a link to the owning record; the server stores no link, so `proposed`. */
  readonly label: 'proposed' | 'approved';
  /** Whether the decision record names who created it. The creator id itself is never shown. */
  readonly creator: 'recorded' | 'notRecorded';
  readonly ageMinutes: number | null;
  /** The decision text as the server stored it (English, free text). Technical only: null for Owner. */
  readonly text: string | null;
}

export type InvestigationReadState = 'ok' | 'empty' | 'unreadable';

export interface InvestigationReadView {
  readonly records: readonly RecordRow[];
  readonly decisions: readonly DecisionRow[];
  readonly state: InvestigationReadState;
  /** Part of an answer could not be read and was left out: say so, never show the list as complete. */
  readonly incomplete: boolean;
  /** True for the synthetic fixtures, so every state, failures included, is marked as demo data; false for live bodies. */
  readonly demo: boolean;
}

type Rec = Record<string, unknown>;
const isObject = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Minutes from `at` to `now`; null for a missing, unparsable or future time. */
function ageOf(at: unknown, now: Date): number | null {
  const t = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  const ms = now.getTime() - t;
  return Number.isNaN(t) || ms < 0 ? null : Math.floor(ms / 60_000);
}

/**
 * The authority for each source the body holds a read record of. The server answers only with sources the caller may read
 * (it answers 404 otherwise), so a read record means a reachable, granted source; its last read is the latest time the server
 * received a read record of it. Only GitHub has a TTL here: any other source gets no authority, so its records stay unread.
 */
function sourcesOf(records: readonly Rec[], now: Date, synthetic: boolean): Map<string, SourceAuthority> {
  const latest = new Map<string, string>();
  for (const r of records) {
    const id = str(r['sourceId']);
    const ref = str(r['sourceRef']);
    const at = str(r['receivedAt']);
    if (!id || !ref?.startsWith('github:') || !at || (r['state'] !== 'ok' && r['state'] !== 'stale') || Number.isNaN(Date.parse(at))) continue;
    const prev = latest.get(id);
    if (!prev || Date.parse(at) > Date.parse(prev)) latest.set(id, at);
  }
  return new Map([...latest].map(([id, at]) => {
    const age = ageOf(at, now);
    return [id, { provider: 'github', connectivity: 'reachable', lastSuccessAt: age === null ? null : at, ageMinutes: age, ttlSeconds: GITHUB_TTL_SECONDS, synthetic }];
  }));
}

const REASONS: readonly string[] = ['error', 'denied', 'unknown'];

/** A GET /decisions item as a HumanDecision record, so decisionLabel() decides its label. Null when it is not a decision record. */
function decisionRecord(d: unknown): Rec | null {
  if (!isObject(d) || !str(d['id']) || !str(d['decision']) || !Array.isArray(d['citations'])) return null;
  return { id: d['id'], type: 'HumanDecision', citations: d['citations'], payload: { decision: d['decision'], rationale: d['rationale'] } };
}

/**
 * The server-shaped records of one synthetic investigation, for a persona. Nontechnical gets null: the panel is not shown to
 * them (source references and record types are technical detail). Owner gets type, read state, age and decisions without the
 * server's free text or source references. Technical gets every field.
 */
export function investigationReadView(
  persona: Persona,
  body: unknown = INVESTIGATION,
  decisions: unknown = DECISIONS,
  now: Date = FIXTURE_NOW,
  origin: ReadOrigin = 'fixture',
): InvestigationReadView | null {
  if (persona === 'nontechnical') return null;
  const technical = persona === 'technical';
  const synthetic = origin === 'fixture';
  const empty = { records: [], decisions: [], demo: synthetic };
  if (!isObject(body) || !str(body['id']) || !Array.isArray(body['evidence'])) return { ...empty, state: 'unreadable', incomplete: true };

  const invId = body['id'] as string;
  const evidence = (body['evidence'] as unknown[]).filter(isObject);
  let dropped = (body['evidence'] as unknown[]).length - evidence.length;
  const sources = sourcesOf(evidence, now, synthetic);

  const records: RecordRow[] = [];
  const decisionById = new Map<string, Rec>();
  for (const r of evidence) {
    if (r['type'] === 'HumanDecision') {
      if (decisionLabel(r) === null) dropped += 1;
      else decisionById.set(r['id'] as string, r);
      continue;
    }
    const ref = toEvidenceReference(r, sources, now);
    if (!ref) {
      dropped += 1;
      continue;
    }
    const read: RecordRead = ref.observation ? effectiveFreshness(ref) : 'notRead';
    const state = r['state'] as string;
    records.push({
      id: ref.id,
      label: resolveLabel(ref),
      read,
      reason: ref.observation ? null : REASONS.includes(state) ? (state as NotReadReason) : 'noSource',
      ageMinutes: ref.observation ? ageOf(ref.observation.observedAt, now) : null,
      sourceRef: technical ? str(r['sourceRef']) : null,
    });
  }

  // GET /decisions: the items of this investigation. A malformed body or item is left out and said, never shown as none.
  const items = isObject(decisions) && Array.isArray(decisions['items']) ? (decisions['items'] as unknown[]) : null;
  if (items === null) dropped += 1;
  // The body is one page. Only `nextCursor: null` says it is the last one: a cursor means later pages were not read,
  // and a missing or malformed one leaves that unknown. Either way the list is not shown as complete.
  const morePages = items !== null && !(isObject(decisions) && decisions['nextCursor'] === null);
  const created = new Map<string, Rec>();
  for (const d of items ?? []) {
    const rec = decisionRecord(d);
    if (!rec || !isObject(d)) {
      dropped += 1;
      continue;
    }
    if (d['investigationId'] !== invId) continue;
    created.set(rec['id'] as string, d);
    if (!decisionById.has(rec['id'] as string)) decisionById.set(rec['id'] as string, rec);
  }

  const decisionRows: DecisionRow[] = [...decisionById.values()].map((r) => {
    const id = r['id'] as string;
    const item = created.get(id);
    const payload = isObject(r['payload']) ? r['payload'] : {};
    return {
      id,
      label: decisionLabel(r) ?? 'proposed',
      creator: item && str(item['createdBy']) ? 'recorded' : 'notRecorded',
      ageMinutes: ageOf(item?.['createdAt'] ?? r['observedAt'], now),
      text: technical ? str(payload['decision']) : null,
    };
  });

  const nothing = records.length === 0 && decisionRows.length === 0;
  return {
    records,
    decisions: decisionRows,
    state: nothing ? (dropped > 0 ? 'unreadable' : 'empty') : 'ok',
    incomplete: dropped > 0 || morePages,
    demo: synthetic,
  };
}
