// Persona-safe evidence rows for V2. Mirrors V1's viewFor rules: restricted evidence reveals only that it exists, and
// only Technical sees targets, external ids and rules. Labels and freshness come from the contract, never from here.
import { effectiveFreshness, resolveLabel } from '../../contract/rules';
import type { DisplayLabel, EvidenceReference, Freshness, Persona, Provider } from '../../contract/types';
import type { SourceMeta, World, GraphNode } from '../../contract/world';
import { nodeStatus } from './status';

export interface EvidenceView {
  readonly id: string;
  readonly label: DisplayLabel;
  readonly freshness: Freshness;
  readonly provider: Provider | null;
  readonly ageMinutes: number | null;
  readonly restricted: boolean;
  readonly notReadReason?: EvidenceReference['notReadReason'];
  readonly observedAt?: string;
  readonly targetLabel?: string;
  readonly externalId?: string;
  readonly rule?: string;
}

export function evidenceView(ref: EvidenceReference, persona: Persona): EvidenceView {
  if (ref.visibility === 'technical' && persona !== 'technical') {
    return { id: ref.id, label: 'unknown', freshness: 'unknown', provider: null, ageMinutes: null, restricted: true };
  }
  const o = ref.observation;
  const base: EvidenceView = {
    id: ref.id,
    label: resolveLabel(ref),
    freshness: effectiveFreshness(ref),
    provider: o?.source.provider ?? null,
    ageMinutes: o?.source.ageMinutes ?? null,
    restricted: false,
    ...(ref.notReadReason ? { notReadReason: ref.notReadReason } : {}),
  };
  if (persona === 'nontechnical') return base;
  const owner: EvidenceView = { ...base, ...(o ? { observedAt: o.observedAt } : {}) };
  if (persona === 'owner') return owner;
  return {
    ...owner,
    ...(o ? { targetLabel: o.target.label } : {}),
    ...(o?.target.externalId ? { externalId: o.target.externalId } : {}),
    ...(ref.rule ? { rule: ref.rule } : {}),
  };
}

export const evidenceOf = (w: World, ids: readonly string[]): readonly EvidenceReference[] =>
  ids.map((id) => w.evidence[id]).filter((e): e is EvidenceReference => e !== undefined);

export type NodeChipKind = 'check' | 'healthy' | 'degraded' | 'down' | 'unavailable' | 'notset' | 'stale' | 'unknown';

/** The one status chip a node shows. A failing check outranks everything; unknown never reads as healthy. */
export function nodeChip(n: GraphNode, sources: readonly SourceMeta[]): { readonly kind: NodeChipKind; readonly tone: 'ok' | 'warn' | 'bad' | 'unk' } {
  const st = nodeStatus(n);
  if (st.checkFailing) return { kind: 'check', tone: 'warn' };
  const conn = n.provider ? sources.find((s) => s.provider === n.provider)?.source.connectivity : undefined;
  if (conn === 'unavailable') return { kind: 'unavailable', tone: 'bad' };
  if (conn === 'not_configured') return { kind: 'notset', tone: 'unk' };
  if (st.health === 'healthy') return { kind: 'healthy', tone: 'ok' };
  if (st.health === 'degraded') return { kind: 'degraded', tone: 'warn' };
  if (st.health === 'down') return { kind: 'down', tone: 'bad' };
  if (n.state.freshness === 'stale' || st.freshness === 'stale') return { kind: 'stale', tone: 'warn' };
  return { kind: 'unknown', tone: 'unk' };
}
