// COG-03 S3 (BACK-106 R8): the frozen corpus must pass in full, with zero unauthorized disclosures.
// Hidden-existence cases compare a corpus where the Jira source is not visible with one where the
// referenced keys never existed: the answers must be identical.
import { canonicalJson } from '../../src/memory/memory.canonical';
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { GH, JIRA } from '../memory/memory.fixture';
import { CORPUS_VERSION, corpusRows, EXPECTED_CONTAINS, EXPECTED_HOPS, EXPECTED_MENTIONS, EXPECTED_UNRESOLVED, REF, SEARCH_CASES } from './retrieval.corpus';
import { projectionOf } from './retrieval.fixture';

const corpus = projectionOf(corpusRows());

describe(`retrieval corpus ${CORPUS_VERSION}: search`, () => {
  it.each(SEARCH_CASES.map((c) => [c.name, c]))('%s', (_name, c) => {
    const r = search(corpus, c.query);
    expect(r.outcome).toBe(c.outcome);
    expect(r.hits.map((h) => h.identity.sourceRef)).toEqual(c.refs);
    if (c.status) expect(r.hits.map((h) => h.status)).toEqual(c.status);
    for (const h of r.hits) {
      expect(h.evidence.length).toBeGreaterThan(0);
      if (h.status === 'verified') expect(h.revision).not.toBeNull();
      else expect(h.status).not.toBe('verified');
    }
  });
});

describe(`retrieval corpus ${CORPUS_VERSION}: relationships and multi-hop`, () => {
  const rel = relationships(corpus);

  it('contains', () => {
    expect(rel.edges.filter((e) => e.type === 'contains').map((e) => e.to.sourceRef)).toEqual(EXPECTED_CONTAINS);
  });

  it('mentions', () => {
    expect(rel.edges.filter((e) => e.type === 'mentions').map((e) => [e.from.sourceRef, e.to.sourceRef, e.text])).toEqual(EXPECTED_MENTIONS);
  });

  it('unresolved mentions', () => {
    expect(rel.unresolved.map((u) => [u.from.sourceRef, u.text])).toEqual(EXPECTED_UNRESOLVED);
  });

  it('multi-hop from a Jira issue to the repository and its items', () => {
    const t = related(corpus, { sourceId: JIRA, sourceRef: REF.jira('OPS-3'), kind: 'jira_issue' }, { depth: 3 });
    expect(Object.fromEntries(t.nodes.map((n) => [n.identity.sourceRef, n.depth]))).toEqual(EXPECTED_HOPS);
    expect(t.truncated).toBe(false);
  });
});

describe(`retrieval corpus ${CORPUS_VERSION}: hidden existence`, () => {
  // Hidden: the Jira source is not visible. Nonexistent: Jira is visible but OPS-3 never existed.
  const hidden = projectionOf(corpusRows().filter((r) => r.sourceId !== JIRA));
  const nonexistent = projectionOf(corpusRows().filter((r) => r.sourceRef !== REF.jira('OPS-3')));
  const fromGithub = (p: typeof hidden) => {
    const rel = relationships(p);
    return canonicalJson({ edges: rel.edges.filter((e) => e.from.sourceId === GH), unresolved: rel.unresolved.filter((u) => u.from.sourceId === GH) });
  };

  it('relationships from visible items are identical', () => {
    expect(fromGithub(hidden)).toBe(fromGithub(nonexistent));
  });

  it('a search for a hidden key equals a search for a key that never existed', () => {
    const strip = (r: ReturnType<typeof search>) => ({ ...r, fingerprint: '' });
    expect(strip(search(hidden, 'OPS-3'))).toEqual(strip(search(hidden, 'OPS-98')));
    expect(strip(search(hidden, 'OPS-3'))).toEqual(strip(search(nonexistent, 'OPS-3')));
  });

  it('traversal from the PR that mentions it is identical', () => {
    const start = { sourceId: GH, sourceRef: REF.pr(35), kind: 'pull_request' };
    expect(canonicalJson(related(hidden, start, { depth: 3 }))).toBe(canonicalJson(related(nonexistent, start, { depth: 3 })));
  });
});
