// Decision Inbox and detail views (BACK-13). Display only: Kawalys records, approves and executes nothing.
// Pure functions over the synthetic world. Persona redaction happens here, so screens never see banned strings.
import { effectiveFreshness, resolveLabel, worstFreshness } from '../contract/rules';
import type { DisplayLabel, EvidenceReference, Freshness, Lang, Persona, Provider } from '../contract/types';
import type { Decision, DecisionOption, L10n, ProjectId, Severity, World } from '../contract/world';
import { evidenceTitleFor, evidenceViewFor } from './evidence';
import { decisionById, projectById } from './world';

export type ProjectFilter = 'all' | ProjectId;
export const PROJECT_FILTERS: readonly ProjectFilter[] = ['all', 'RT', 'KH', 'SB'];

/** Strings Owner and Nontechnical must never see (brief). Technical sees everything. */
export const BANNED_FOR_LAY: readonly string[] = [
  'integration-tests', '#DEMO-4471', 'PR #DEMO-88', 'AssertionError', 'example.invalid', 'DEMO-4468', 'DEMO-5120', 'DEMO-311',
];

// Readable rewrites for known tokens, then a blunt strip so nothing banned can slip through.
const REWRITES: Readonly<Record<Lang, readonly (readonly [RegExp, string])[]>> = {
  en: [[/deploy \{DEMO-311\}/g, 'recent deploy']],
  ar: [[/النشر \{DEMO-311\}/g, 'النشر الأخير']],
};

/** Persona-safe copy of fixture text. Technical is untouched. */
export function redact(text: string, persona: Persona, lang: Lang): string {
  if (persona === 'technical') return text;
  const rewritten = REWRITES[lang].reduce((t, [re, to]) => t.replace(re, to), text);
  return BANNED_FOR_LAY.reduce((t, b) => t.split(b).join('…'), rewritten);
}

const PRIORITY: Readonly<Record<Severity, number>> = { high: 0, medium: 1, low: 2 };

/** Pending proposals: priority first, then the longest waiting first. Never mutates the input. */
export function sortPending(list: readonly Decision[]): readonly Decision[] {
  return [...list].sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || b.ageMinutes - a.ageMinutes);
}

/** The label a decision shows. Approved only when its record resolves to approved (needs a source link). */
export function decisionLabel(d: Decision): DisplayLabel {
  if (d.classification === 'proposed') return 'proposed';
  return d.record ? resolveLabel(d.record) : 'proposed';
}

export interface EvidenceSummary {
  /** Items this persona may see. A Technical-only item never counts for another persona (M05-D05-B, BACK-76). */
  readonly total: number;
  readonly read: number;
  readonly notRead: number;
  /** Worst freshness among items this persona can see; unknown when none is visible. */
  readonly worst: Freshness;
}

export function summariseEvidence(refs: readonly EvidenceReference[], persona: Persona): EvidenceSummary {
  // The projected world never holds a withheld item; this filter guards raw, unprojected input.
  const visible = refs.filter((r) => persona === 'technical' || r.visibility !== 'technical');
  const notRead = visible.filter((r) => r.observation === null).length;
  return {
    total: visible.length,
    read: visible.length - notRead,
    notRead,
    worst: worstFreshness(visible.map(effectiveFreshness)),
  };
}

export interface DecisionRow {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly priority: Severity;
  readonly label: DisplayLabel;
  readonly title: string;
  readonly ageMinutes: number;
  readonly evidence: EvidenceSummary;
  readonly unknownsCount: number;
}

function rowOf(w: World, d: Decision, persona: Persona, lang: Lang): DecisionRow {
  return {
    id: d.id,
    projectId: d.projectId,
    projectName: projectById(w, d.projectId)?.name ?? d.projectId,
    priority: d.priority,
    label: decisionLabel(d),
    title: redact(d.title[persona][lang], persona, lang),
    ageMinutes: d.ageMinutes,
    evidence: summariseEvidence(d.observed, persona),
    unknownsCount: d.unknowns.length,
  };
}

export interface InboxView {
  readonly pending: readonly DecisionRow[];
  readonly historical: readonly DecisionRow[];
}

export function inboxView(w: World, filter: ProjectFilter, persona: Persona, lang: Lang): InboxView {
  const inFilter = (d: Decision): boolean => filter === 'all' || d.projectId === filter;
  const mine = w.decisions.filter(inFilter);
  return {
    pending: sortPending(mine.filter((d) => d.classification === 'proposed')).map((d) => rowOf(w, d, persona, lang)),
    historical: mine.filter((d) => d.classification !== 'proposed').map((d) => rowOf(w, d, persona, lang)),
  };
}

export interface EvidenceRow {
  readonly id: string;
  readonly title: string;
  readonly label: DisplayLabel;
  readonly freshness: Freshness;
  readonly ageMinutes: number | null;
  readonly provider?: Provider;
  readonly notReadReason?: EvidenceReference['notReadReason'];
}

export interface OptionView {
  readonly id: string;
  readonly title: string;
  readonly benefit: string;
  readonly risk: string;
  readonly unknowns: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly suggested: boolean;
}

export interface DecisionDetailView {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly investigationId?: string;
  readonly priority: Severity;
  readonly label: DisplayLabel;
  readonly proposed: boolean;
  readonly title: string;
  readonly context: string;
  readonly ageMinutes: number;
  readonly observed: readonly EvidenceRow[];
  readonly hypotheses: readonly string[];
  readonly unknowns: readonly string[];
  readonly options: readonly OptionView[];
  readonly nextStep: string;
  readonly decidedIn: string;
}

function evidenceRow(w: World, ref: EvidenceReference, persona: Persona, lang: Lang): EvidenceRow {
  const v = evidenceViewFor(persona, ref);
  return {
    id: ref.id,
    title: redact(evidenceTitleFor(w, ref.id, persona, lang), persona, lang),
    label: v.label,
    freshness: v.freshness,
    ageMinutes: v.ageMinutes,
    ...(v.provider ? { provider: v.provider } : {}),
    ...(v.notReadReason ? { notReadReason: v.notReadReason } : {}),
  };
}

function optionView(o: DecisionOption, persona: Persona, lang: Lang): OptionView {
  const t = (x: L10n): string => redact(x[lang], persona, lang);
  return {
    id: o.id,
    title: t(o.title),
    benefit: t(o.benefit),
    risk: t(o.risk),
    unknowns: o.unknowns.map(t),
    evidenceIds: o.evidence.map((e) => e.id),
    suggested: o.suggested,
  };
}

/** Undefined for an unknown id: the screen shows an error state, never a guess. */
export function decisionDetailView(w: World, id: string, persona: Persona, lang: Lang): DecisionDetailView | undefined {
  const d = decisionById(w, id);
  if (!d) return undefined;
  const t = (x: L10n): string => redact(x[lang], persona, lang);
  return {
    id: d.id,
    projectId: d.projectId,
    projectName: projectById(w, d.projectId)?.name ?? d.projectId,
    ...(d.investigationId ? { investigationId: d.investigationId } : {}),
    priority: d.priority,
    label: decisionLabel(d),
    proposed: d.classification === 'proposed',
    title: redact(d.title[persona][lang], persona, lang),
    context: t(d.context),
    ageMinutes: d.ageMinutes,
    observed: d.observed.map((e) => evidenceRow(w, e, persona, lang)),
    hypotheses: d.hypotheses.map(t),
    unknowns: d.unknowns.map(t),
    options: d.options.map((o) => optionView(o, persona, lang)),
    nextStep: redact(d.nextStep[persona][lang], persona, lang),
    decidedIn: d.decidedIn,
  };
}
