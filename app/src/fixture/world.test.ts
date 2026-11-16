import { describe, expect, it } from 'vitest';
import { resolveHealth, resolveLabel } from '../contract/rules';
import type { EvidenceReference } from '../contract/types';
import { SHELL } from '../i18n/shell';
import { buildIndex, search } from '../nav/search';
import {
  componentById, contextOfEvidence, decisionById, evidenceById, investigationById, isRestrictedFor, projectById,
  sourceSummary, triadOf, tr, trp,
} from '../view/world';
import { WORLD } from './world';

/** Every string value in an object tree, with its path. */
function strings(v: unknown, path = ''): Array<[string, string]> {
  if (typeof v === 'string') return [[path, v]];
  if (typeof v === 'function') return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, `${path}.${k}`));
  return [];
}

const arabicText = (v: unknown): Array<[string, string]> => strings(v).filter(([p]) => p.endsWith('.ar') || p.startsWith('.ar'));

describe('synthetic world integrity', () => {
  const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

  it('ids are unique per collection', () => {
    for (const list of [WORLD.projects, WORLD.investigations, WORLD.decisions, WORLD.agents, WORLD.activity]) {
      const l = ids(list);
      expect(new Set(l).size).toBe(l.length);
    }
  });

  it('every cross reference resolves', () => {
    for (const p of WORLD.projects) {
      const comp = new Set(p.components.map((c) => c.id));
      for (const e of p.edges) { expect(comp.has(e.from), e.from).toBe(true); expect(comp.has(e.to), e.to).toBe(true); }
      for (const a of p.attention) {
        if (a.componentId) expect(comp.has(a.componentId)).toBe(true);
        if (a.investigationId) expect(investigationById(WORLD, a.investigationId)).toBeDefined();
        if (a.decisionId) expect(decisionById(WORLD, a.decisionId)).toBeDefined();
      }
      for (const c of p.components) if (c.investigationId) expect(investigationById(WORLD, c.investigationId)).toBeDefined();
    }
    for (const i of WORLD.investigations) {
      const p = projectById(WORLD, i.projectId);
      expect(p).toBeDefined();
      expect(p && componentById(p, i.componentId)).toBeDefined();
      if (i.decisionId) expect(decisionById(WORLD, i.decisionId)?.investigationId).toBe(i.id);
      for (const e of i.evidence) expect(evidenceById(WORLD, e.id)).toBe(e);
    }
    for (const d of WORLD.decisions) {
      expect(projectById(WORLD, d.projectId)).toBeDefined();
      if (d.investigationId) expect(investigationById(WORLD, d.investigationId)).toBeDefined();
    }
    for (const a of WORLD.activity) {
      if (a.evidenceId) expect(evidenceById(WORLD, a.evidenceId)).toBeDefined();
      if (a.investigationId) expect(investigationById(WORLD, a.investigationId)).toBeDefined();
      if (a.agentId) expect(WORLD.agents.some((g) => g.id === a.agentId)).toBe(true);
    }
  });

  it('the one story: CI failure -> RT attention -> stock-sync -> INV-DEMO-7 -> DEC-DEMO-3', () => {
    const rt = projectById(WORLD, 'RT');
    const att = rt?.attention[0];
    expect(att?.componentId).toBe('stock-sync');
    expect(att?.investigationId).toBe('INV-DEMO-7');
    expect(att?.decisionId).toBe('DEC-DEMO-3');
    expect(att?.evidence.map((e) => e.id)).toContain('E-1');
    expect(decisionById(WORLD, 'DEC-DEMO-3')?.decidedIn).toBe('RT-DEMO-112');
  });

  it('every link is a demo link on *.example.invalid', () => {
    for (const e of Object.values(WORLD.evidence)) {
      const url = e.observation?.sourceUrl;
      if (url) expect(new URL(url).hostname.endsWith('.example.invalid'), url).toBe(true);
      if (e.observation) expect(e.observation.source.synthetic).toBe(true);
    }
  });

  it('only one decision is Approved, and it resolves to approved through its source record', () => {
    const approved = WORLD.decisions.filter((d) => d.classification === 'approved');
    expect(approved).toHaveLength(1);
    expect(approved[0]?.record && resolveLabel(approved[0].record)).toBe('approved');
    for (const d of WORLD.decisions.filter((x) => x.classification === 'proposed')) expect(d.record).toBeUndefined();
  });

  it('covers every required synthetic state', () => {
    const all = WORLD.projects.flatMap((p) => p.sources);
    expect(all.some((s) => s.connectivity === 'reachable')).toBe(true);
    expect(all.some((s) => s.connectivity === 'unavailable')).toBe(true);
    expect(all.some((s) => s.connectivity === 'not_configured')).toBe(true);
    const ev = Object.values(WORLD.evidence);
    expect(ev.some((e) => e.visibility === 'technical')).toBe(true); // restricted
    expect(ev.some((e) => e.observation === null)).toBe(true); // partial
    expect(WORLD.projects.some((p) => p.components.length === 0)).toBe(true); // empty
    const healths = WORLD.projects.flatMap((p) => p.components.map((c) => resolveHealth(c.state)));
    for (const h of ['healthy', 'degraded', 'unknown'] as const) expect(healths).toContain(h);
    // Stale "healthy" claim on inventory resolves to unknown.
    const inv = projectById(WORLD, 'RT')?.components.find((c) => c.id === 'inventory');
    expect(inv?.state.health).toBe('healthy');
    expect(inv && resolveHealth(inv.state)).toBe('unknown');
  });

  it('every bilingual string has both languages and Arabic has no Latin outside {braces}', () => {
    const all = strings(WORLD);
    for (const [p, v] of all.filter(([path]) => path.endsWith('.en') || path.endsWith('.ar'))) expect(v.trim(), p).not.toBe('');
    for (const [p, v] of arabicText(WORLD)) expect(/[A-Za-z]/.test(v.replace(/\{[^{}]*\}/g, '')), `${p}: ${v}`).toBe(false);
  });

  it('owner and nontechnical text never names job names, run ids or PR ids', () => {
    const banned = ['integration-tests', '#DEMO-4471', 'PR #DEMO-88'];
    const personaText = [
      ...WORLD.investigations.flatMap((i) => [i.title.owner, i.title.nontechnical]),
      ...WORLD.projects.flatMap((p) => p.attention.flatMap((a) => [a.title.owner, a.title.nontechnical])),
      ...WORLD.decisions.flatMap((d) => [d.title.owner, d.title.nontechnical, d.nextStep.owner, d.nextStep.nontechnical]),
    ];
    for (const t of personaText) for (const b of banned) { expect(t.en.includes(b), t.en).toBe(false); expect(t.ar.includes(b), t.ar).toBe(false); }
  });

  it('text shown to every persona never names run, deploy or PR ids', () => {
    const banned = ['integration-tests', '#DEMO-4471', 'PR #DEMO-88', 'DEMO-4468', 'DEMO-5120', 'DEMO-311'];
    const shared = [
      ...WORLD.decisions.flatMap((d) => [d.context, ...d.hypotheses, ...d.unknowns, ...d.options.flatMap((o) => [o.title, o.benefit, o.risk, ...o.unknowns])]),
      ...WORLD.investigations.flatMap((i) => i.missing),
      ...WORLD.projects.map((p) => p.summary),
      ...WORLD.activity.map((a) => a.text),
    ];
    for (const t of shared) for (const b of banned) { expect(t.en.includes(b), t.en).toBe(false); expect(t.ar.includes(b), t.ar).toBe(false); }
  });
});

describe('shell copy', () => {
  it('Arabic shell copy has no Latin outside {braces}', () => {
    for (const [p, v] of strings(SHELL.ar)) expect(/[A-Za-z]/.test(v.replace(/\{[^{}]*\}/g, '')), `${p}: ${v}`).toBe(false);
    expect(SHELL.ar.search.results(3)).toBe('3 نتيجة');
    expect(SHELL.en.search.results(1)).toBe('1 result');
    expect(SHELL.en.search.results(2)).toBe('2 results');
  });
});

describe('world view helpers', () => {
  const rt = projectById(WORLD, 'RT');
  it('triad keeps connectivity, freshness and health separate', () => {
    const inv = rt && componentById(rt, 'inventory');
    expect(inv && triadOf(inv.state)).toEqual({ connectivity: 'reachable', freshness: 'stale', health: 'unknown', ageMinutes: 540 });
    const gw = rt && componentById(rt, 'api-gateway');
    expect(gw && triadOf(gw.state)).toEqual({ connectivity: 'reachable', freshness: 'current', health: 'healthy', ageMinutes: 6 });
    const pos = rt && componentById(rt, 'pos');
    expect(pos && triadOf(pos.state)).toEqual({ connectivity: 'not_configured', freshness: 'unknown', health: 'unknown', ageMinutes: null });
  });
  it('summarises sources without hiding unknown', () => {
    expect(rt && sourceSummary(rt.sources)).toEqual({ total: 5, current: 2, stale: 2, unknown: 1, unavailable: 1, notConfigured: 1 });
  });
  it('translates and finds context', () => {
    const d = decisionById(WORLD, 'DEC-DEMO-3');
    expect(d && tr(d.context, 'en')).toContain('RT 2.14-rc');
    expect(d && trp(d.title, 'nontechnical', 'ar')).toMatch(/[؀-ۿ]/);
    expect(contextOfEvidence(WORLD, 'E-22').project?.id).toBe('KH');
    expect(contextOfEvidence(WORLD, 'E-41')).toEqual({});
    const e12 = evidenceById(WORLD, 'E-12') as EvidenceReference;
    expect(isRestrictedFor(e12, 'owner')).toBe(true);
    expect(isRestrictedFor(e12, 'technical')).toBe(false);
  });
});

describe('demo search', () => {
  const index = buildIndex(WORLD);
  it('finds the story by id across kinds', () => {
    expect(search(index, 'inv-demo-7', 'owner', 'en').map((i) => i.kind)).toContain('investigation');
    expect(search(index, 'RT-DEMO-112', 'owner', 'en').map((i) => i.kind)).toContain('workItem');
    expect(search(index, 'stock', 'owner', 'en').some((i) => i.href === '#/project/RT/stock-sync')).toBe(true);
    expect(search(index, 'E-1', 'owner', 'en')[0]?.href).toBe('#/evidence/E-1?from=INV-DEMO-7');
    expect(search(index, 'E-41', 'owner', 'en')[0]?.href).toBe('#/evidence/E-41');
  });
  it('matches plain-language titles in Arabic', () => {
    expect(search(index, 'نقاط البيع', 'owner', 'ar')[0]?.id).toBe('RT');
  });
  it('hides technical-only evidence from other personas and ignores short queries', () => {
    expect(search(index, 'E-12', 'owner', 'en')).toHaveLength(0);
    expect(search(index, 'E-12', 'technical', 'en')).toHaveLength(1);
    expect(search(index, 'e', 'technical', 'en')).toHaveLength(0);
  });
});
