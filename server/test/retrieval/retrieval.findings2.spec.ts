// COG-08 second independent review (Codex, 2026-11-27, commit b980034) regressions for COG-03:
// identifier spoofs still reaching lexical tiers (underscore keys, U+2212, overlong numbers, non-ASCII
// digits, the combining dot from lowercasing U+0130); relationship work bounded only after the fact;
// mention parsing dropping valid long or underscore references and matching keys glued inside words;
// links from conflicting or stale titles shown without their status; and mark stripping changing
// ordinary words. Each test failed on b980034. Escapes only: no raw invisible characters in source.
import { project } from '../../src/memory/memory.projector';
import type { MemoryRow, MemorySource } from '../../src/memory/memory.types';
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { at, GH, ghIssue, pr, REPO, request, sources } from '../memory/memory.fixture';
import { jira, projectionOf } from './retrieval.fixture';

const o = (id: string, observedAt = at('11:55')) => ({ id, observedAt });
const titled = (n: number, title: string, observedAt = at('11:55')) => pr(n, { title, updatedAt: at('11:00') }, o(`g${n}`, observedAt));
const PR = (n: number) => ({ sourceId: GH, sourceRef: `${REPO}#pull/${n}`, kind: 'pull_request' });

describe('identifier spoofs abstain (second review)', () => {
  const p = projectionOf([
    jira('BACK-1', 'Real issue', 'j1'),
    jira('OPS_CORE-9', 'Underscore project', 'jo9'),
    titled(1, 'OPS_CORE-8 rollout'),
    titled(2, 'BACK-8 rollout'),
    titled(3, 'number 1234567890123456789 release'),
    titled(4, 'bi ck 8 notes'),
  ]);

  it.each([
    ['underscore key with no item', 'OPS_CORE-8'],
    ['minus sign U+2212', 'BACK−8'],
    ['19-digit hash number', '#1234567890123456789'],
    ['19-digit number', '1234567890123456789'],
    ['Devanagari digit', 'BACK-८'],
    ['dotted capital I', 'BİCK-8'],
    ['dotted capital I with spaces folded', 'BİCK-8'],
  ])('%s is no-match, never a fuzzy title hit', (_n, q) => {
    expect(search(p, q)).toMatchObject({ outcome: 'no-match', hits: [] });
  });

  it('an underscore Jira key is found exactly', () => {
    expect(search(p, 'OPS_CORE-9').selected).toMatchObject({ sourceRef: 'jira:OPS_CORE#issue/OPS_CORE-9' });
  });

  it('non-ASCII decimal digits fold to the real key', () => {
    expect(search(p, 'BACK-१').selected).toMatchObject({ sourceRef: 'jira:BACK#issue/BACK-1' });
  });
});

describe('ordinary words keep their marks (second review, Low)', () => {
  it('a Devanagari word with an extra mark is not the same word', () => {
    const p = projectionOf([titled(5, 'चद्र notes')]);
    expect(search(p, 'चंद्र').outcome).toBe('no-match');
    expect(search(p, 'चद्र').outcome).toBe('match');
  });

  it('a CJK term with a hyphen is ordinary text, not a key', () => {
    const p = projectionOf([titled(6, '版本-2 release')]);
    expect(search(p, '版本-2').outcome).toBe('match');
  });

  it('Arabic alef variants still fold (control)', () => {
    expect(search(projectionOf([titled(7, 'إصلاح')]), 'اصلاح').outcome).toBe('match');
  });
});

describe('mention parsing follows the provider grammars (second review)', () => {
  it('long numbers, underscore keys and long Jira numbers all resolve', () => {
    const rows = [
      titled(9, 'See #1000000000, OPS_CORE-8 and BACK-1234567890'),
      titled(1000000000, 'target PR'),
      jira('OPS_CORE-8', 'target', 'jo8'),
      jira('BACK-1234567890', 'target', 'jb'),
    ];
    const edges = relationships(projectionOf(rows)).edges.filter((e) => e.type === 'mentions');
    expect(edges.map((e) => e.text).sort()).toEqual(['#1000000000', 'BACK-1234567890', 'OPS_CORE-8']);
  });

  it('a key glued inside a word is not a mention', () => {
    const rows = [titled(10, 'أBACK-1ب and xBACK-1y'), jira('BACK-1', 'target', 'j1')];
    const rel = relationships(projectionOf(rows));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toEqual([]);
    expect(rel.unresolved).toEqual([]);
  });
});

describe('links carry the status of the text they come from (second review)', () => {
  it('a conflicting title yields no mention and no unresolved marker', () => {
    const rows: MemoryRow[] = [
      ghIssue(20, { updatedAt: at('11:40'), title: 'No mention' }, o('c1', at('11:45'))),
      ghIssue(20, { updatedAt: at('11:40'), title: 'See BACK-1' }, o('c2', at('11:50'))),
      jira('BACK-1', 'target', 'j1'),
    ];
    const rel = relationships(projectionOf(rows));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toEqual([]);
    expect(rel.unresolved).toEqual([]);
  });

  it('a stale title yields a mention marked stale; a fresh one is marked verified', () => {
    const rows = [titled(21, 'See BACK-1', at('11:30')), titled(22, 'See BACK-1'), jira('BACK-1', 'target', 'j1')];
    const mentions = relationships(projectionOf(rows)).edges.filter((e) => e.type === 'mentions');
    expect(mentions.map((e) => [e.from.sourceRef, e.basis])).toEqual([
      [PR(21).sourceRef, 'stale'],
      [PR(22).sourceRef, 'verified'],
    ]);
  });
});

describe('relationship work is bounded on both entry points (second review)', () => {
  it('relationships() caps unresolved mentions and says so', () => {
    const spam = Array.from({ length: 60 }, (_, i) => `SPAM-${i}`).join(' ');
    const rel = relationships(projectionOf([titled(30, spam)]));
    expect(rel.unresolved.length).toBeLessThanOrEqual(50);
    expect(rel.truncated).toBe(true);
  });

  it('cross-source fan-out stops at the edge budget, fast', () => {
    const many: MemorySource[] = Array.from({ length: 100 }, (_, i) => ({ sourceId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, provider: 'jira', purgeHorizon: null }));
    const rows = many.map((s, i) => ({ ...jira('BACK-1', 'mentions BACK-1', `m${i}`), sourceId: s.sourceId }));
    const p = project(rows, request({ sources: [...sources(), ...many] }));
    const start = performance.now();
    const rel = relationships(p);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(rel.edges.length).toBeLessThanOrEqual(2000);
    expect(rel.truncated).toBe(true);
    const t = related(p, { sourceId: many[0]!.sourceId, sourceRef: 'jira:BACK#issue/BACK-1', kind: 'jira_issue' }, { maxNodes: 5 });
    expect(t.truncated).toBe(true);
  });

  it('an ordinary world is not truncated', () => {
    const rel = relationships(projectionOf([titled(40, 'See BACK-1'), jira('BACK-1', 'target', 'j1')]));
    expect(rel.truncated).toBe(false);
  });
});
