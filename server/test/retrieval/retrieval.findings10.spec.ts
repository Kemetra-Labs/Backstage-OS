// COG-08 ninth review (Codex, 2026-11-27, commit 896dc43) regressions for COG-03: invisible characters
// were removed after lowercasing and composition, so they still changed the result (a Greek final sigma,
// a blocked accent composition); the shape fold removed marks only after NFKC had composed them into a
// letter (P + acute became one letter, so `PR 99` lost its shape); and retrieval's fallback text used a
// different history order from memory's cap. Each failed on 896dc43. Plain ASCII source.
import { project } from '../../src/memory/memory.projector';
import { search } from '../../src/retrieval/retrieval.search';
import { at, ghIssue, pr, request } from '../memory/memory.fixture';
import { projectionOf } from './retrieval.fixture';

const ch = (...cps: number[]) => String.fromCodePoint(...cps);
const SOH = ch(1);
const ACUTE = ch(0x301);
const titled = (n: number, title: string) => pr(n, { title, updatedAt: at('11:00') }, { id: `w${n}`, observedAt: at('11:55') });

describe('invisible characters are removed before case and composition', () => {
  it('a control inside a Greek word does not create a final sigma', () => {
    const upper = ch(0x39f, 0x3a3, 0x391); // OMICRON SIGMA ALPHA (capitals)
    const finalForm = ch(0x3bf, 0x3c2, 0x3b1); // omicron, final sigma, alpha
    const p = projectionOf([titled(1, upper), titled(2, finalForm)]);
    const query = ch(0x39f, 0x3a3) + SOH + ch(0x391);
    expect(search(p, query)).toMatchObject({ outcome: 'match', selected: { sourceRef: 'github:kemetra-labs/backstage-os#pull/1' } });
  });

  it('a control between a letter and its accent does not block composition', () => {
    const p = projectionOf([titled(3, `caf${ch(0xe9)} menu`)]);
    expect(search(p, `cafe${SOH}${ACUTE}`).outcome).toBe('match');
  });
});

describe('the shape fold decomposes before it removes marks', () => {
  const p = projectionOf([titled(4, `${ch(0x1e54)}R 99 rollout`)]); // P WITH ACUTE (precomposed)
  it.each([
    ['decomposed P + acute', `P${ACUTE}R 99`],
    ['precomposed P with acute', `${ch(0x1e54)}R 99`],
  ])('%s with no PR 99 is no-match, never a title hit', (_n, q) => {
    expect(search(p, q)).toMatchObject({ outcome: 'no-match', hits: [] });
  });
});

describe('the fallback text follows the order memory uses for history', () => {
  // Conflicting titles at one provider revision (no current run). alpha observed 11:40, received 11:52;
  // beta observed 11:40 (received 11:53) and 11:50 (received 11:51). Memory orders the runs alpha, beta.
  const rows = [
    ghIssue(9, { updatedAt: at('11:00'), title: 'alpha' }, { id: 'a1', observedAt: at('11:40'), receivedAt: at('11:52') }),
    ghIssue(9, { updatedAt: at('11:00'), title: 'beta' }, { id: 'b1', observedAt: at('11:40'), receivedAt: at('11:53') }),
    ghIssue(9, { updatedAt: at('11:00'), title: 'beta' }, { id: 'b2', observedAt: at('11:50'), receivedAt: at('11:51') }),
  ];
  it.each([1, 2])('with history cap %d the fallback text is the newest returned run', (cap) => {
    const p = project(rows, request({ historyCap: cap }));
    expect(p.items[0]!.current).toBeNull();
    expect(search(p, 'beta').outcome).toBe('match');
    expect(search(p, 'alpha').outcome).toBe('no-match');
  });
});
