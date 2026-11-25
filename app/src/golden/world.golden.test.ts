// BACK-102 safety net: a characterization of what each persona is given, recorded before the world was unified. For owner,
// technical and nontechnical it serialises the host world and the lens world (each as its persona-authorized output) and the
// investigation (authorized data, its persona view and both case summaries) to committed JSON. Keys are sorted, so the files
// compare data, not property order. Any later change to what a persona receives fails here; regenerate with UPDATE_GOLDEN=1 only
// for a deliberate, documented change. Synthetic demo data only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { buildIndex } from '../nav/search';
import type { World } from '../contract/world';
import { WORLD } from '../fixture/world';
import { authorizedWorld as lensAuthorized } from '../lenses/logic/authorize';
import { authorizedInvestigation, authorizedWorld as hostAuthorized } from '../view/authorize';
import { summaryFor } from '../view/investigationView';
import { viewFor } from '../view/viewFor';
import { caseEvidence, catalogueEvidence } from '../view/world';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '__golden__');
const PERSONAS = ['owner', 'technical', 'nontechnical'] as const;
type P = (typeof PERSONAS)[number];

const sortKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  }
  return v;
};
const serialise = (v: unknown): string => `${JSON.stringify(sortKeys(v), null, 2)}\n`;

// The files were recorded when the host screens and the lens screens read two worlds. The world is one now, so each file is the
// projection of the one authorized world onto the shape it was recorded in: the portfolio sections with the evidence catalogue,
// and the mission sections with the case evidence. Nothing is filtered out that a persona receives: the evidence each side lists
// is exactly what its screens read (catalogueEvidence, caseEvidence).
const byId = (list: readonly { readonly id: string }[]): Record<string, unknown> => Object.fromEntries(list.map((e) => [e.id, e]));

/** The portfolio sections of the world as the persona receives it, and the demo search index built from it. */
function hostOf(p: P): unknown {
  const w: World = hostAuthorized(WORLD, p);
  return {
    projects: w.projects, investigations: w.investigations, decisions: w.decisions, agents: w.agents, activity: w.activity,
    evidence: byId(catalogueEvidence(w)), evidenceText: w.evidenceText,
  };
}
const searchOf = (p: P): unknown => buildIndex(hostAuthorized(WORLD, p));
/** The mission sections of the world as the persona receives it. */
function lensOf(p: P): unknown {
  const w: World = lensAuthorized(WORLD, p);
  return {
    now: w.now, investigationId: w.investigationId, nodes: w.graph.nodes, edges: w.graph.edges, sources: w.sources,
    sourceEvents: w.sourceTimeline, replay: w.replay, agents: w.missionAgents, missions: w.missions, evidenceById: byId(caseEvidence(w)),
  };
}
function investigationOf(p: P): unknown {
  const inv = authorizedInvestigation(INV_DEMO_7, p);
  const w = hostAuthorized(WORLD, p);
  return { data: inv, view: viewFor(p, inv), summaries: ['INV-DEMO-7', 'INV-DEMO-9'].map((id) => summaryFor(w, id, p) ?? null) };
}

const CASES: ReadonlyArray<readonly [string, (p: P) => unknown]> = [
  ['host', hostOf], ['search', searchOf], ['lens', lensOf], ['investigation', investigationOf],
];

describe('golden: what each persona is given (BACK-102 characterization)', () => {
  for (const p of PERSONAS) {
    for (const [name, of] of CASES) {
      it(`${p} ${name}`, () => {
        const file = join(DIR, `${p}.${name}.json`);
        const actual = serialise(of(p));
        if (process.env.UPDATE_GOLDEN === '1') writeFileSync(file, actual);
        expect(existsSync(file), `${file} is missing; it is committed, never generated in a normal run`).toBe(true);
        expect(actual).toBe(readFileSync(file, 'utf8'));
      });
    }
  }
});
