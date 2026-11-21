// BACK-30 (M05-D05-B): a viewer not authorized for a Technical-only record must not be able to tell it exists.
// Persona is a display switch, not authorization: this scopes the demo world only and claims no server-side enforcement.
import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixtures/world';
import { authorizedWorld } from './authorize';
import { nodeStatus } from './status';

const UNAUTHORIZED = ['owner', 'nontechnical'] as const;
const technicalRecords = Object.values(WORLD.evidenceById).filter((r) => r.visibility === 'technical');

describe('authorizedWorld', () => {
  it('returns the same world for Technical', () => {
    expect(authorizedWorld(WORLD, 'technical')).toBe(WORLD);
  });

  it('the fixture has a Technical-only record to hide (guards the tests below against passing vacuously)', () => {
    expect(technicalRecords.map((r) => r.id)).toContain('E-5');
  });

  for (const p of UNAUTHORIZED) {
    describe(p, () => {
      const w = authorizedWorld(WORLD, p);

      it('contains no Technical-only record id, target label or external id anywhere in the world', () => {
        const json = JSON.stringify(w);
        expect(json).not.toContain('E-5');
        // A node's own title is its catalogue name, independent of any evidence, so it is not a leak of the record's target.
        const noTitles = JSON.stringify({ ...w, nodes: w.nodes.map((n) => ({ ...n, title: '' })) });
        for (const r of technicalRecords) {
          expect(json).not.toContain(r.id);
          const t = r.observation?.target;
          if (t?.label) expect(noTitles).not.toContain(t.label);
          if (t?.externalId) expect(json).not.toContain(t.externalId);
        }
      });

      it('removes the link built only on Technical-only evidence', () => {
        expect(w.edges.find((e) => e.id === 'd4')).toBeUndefined();
        expect(w.edges.length).toBe(WORLD.edges.length - 1);
      });

      it('turns a node whose only basis was removed into unknown, never healthy and never stale', () => {
        const inv = w.nodes.find((n) => n.id === 'inventory')!;
        const st = nodeStatus(inv);
        expect(st.health).not.toBe('healthy');
        expect(st.health).toBe('unknown');
        expect(st.freshness).not.toBe('stale');
        expect(inv.state.freshness).toBe('unknown');
        expect(inv.state.basis).toEqual([]);
      });

      it('keeps the Sentry node, with no evidence, and every source authority unchanged', () => {
        const sentry = w.nodes.find((n) => n.id === 'sentry')!;
        expect(sentry).toBeDefined();
        expect(sentry.evidence).toEqual([]);
        // Source reachability, age and TTL are authorized for everyone. Only the Technical-only record leaves a source's health basis
        // (and the claim that rested only on it is reset, checked below).
        expect(w.sources.map((s) => s.source)).toEqual(WORLD.sources.map((s) => s.source));
        const blank = (list: typeof w.sources) => list.map((s) => ({ ...s, health: { ...s.health, basis: [], health: 'x' } }));
        expect(blank(w.sources.filter((s) => s.provider !== 'sentry'))).toEqual(blank(WORLD.sources.filter((s) => s.provider !== 'sentry')));
        expect(w.sources.filter((s) => s.provider !== 'sentry')).toEqual(WORLD.sources.filter((s) => s.provider !== 'sentry'));
        const sentrySource = w.sources.find((s) => s.provider === 'sentry')!;
        expect(sentrySource.health.basis).toEqual([]);
        // A claim whose only basis was removed is unknown, never healthy; freshness stays what the source authority says
        expect(sentrySource.health.health).toBe('unknown');
        expect(sentrySource.health.freshness).toBe('stale');
        expect(w.sources.find((s) => s.provider === 'github')!.health.health).toBe('healthy');
      });

      it('keeps a record independently supported by authorized evidence', () => {
        expect(w.missions.find((m) => m.id === 'MSN-DEMO-2')!.evidence).toEqual(['E-9']);
        expect(w.evidenceById['E-9']).toBeDefined();
      });

      it('is memoized per persona', () => {
        expect(authorizedWorld(WORLD, p)).toBe(authorizedWorld(WORLD, p));
        expect(authorizedWorld(WORLD, 'owner')).not.toBe(authorizedWorld(WORLD, 'nontechnical'));
      });

      it('does not mutate the source world', () => {
        expect(WORLD.evidenceById['E-5']).toBeDefined();
        expect(WORLD.edges.find((e) => e.id === 'd4')).toBeDefined();
      });
    });
  }
});
