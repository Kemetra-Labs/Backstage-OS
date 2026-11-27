// COG-08 eighth review (Codex, 2026-11-27, commit d8f8a02) regressions for COG-03: control characters in
// a query (U+0001 inside a key, U+0085 between words) sent identifier-shaped queries to the title tier,
// and the default-ignorable fold merged ordinary titles that differ by a variation selector. Each failed
// on d8f8a02. Plain ASCII source: special characters come from String.fromCharCode / fromCodePoint.
import { search } from '../../src/retrieval/retrieval.search';
import { at, pr } from '../memory/memory.fixture';
import { projectionOf } from './retrieval.fixture';

const SOH = String.fromCharCode(1);
const NEL = String.fromCharCode(0x85);
const KUZU = String.fromCharCode(0x845b);
const VS17 = String.fromCodePoint(0xe0100);
const titled = (n: number, title: string) => pr(n, { title, updatedAt: at('11:00') }, { id: `v${n}`, observedAt: at('11:55') });

describe('control characters cannot send an identifier query to the title tier', () => {
  it('BACK<U+0001>-8 with no BACK-8 item is no-match', () => {
    expect(search(projectionOf([titled(1, 'BACK-8 rollout')]), `BACK${SOH}-8`)).toMatchObject({ outcome: 'no-match', hits: [] });
  });

  it('PR<U+0085>99 with no PR 99 is no-match, as PR<newline>99 is', () => {
    const p = projectionOf([titled(2, 'PR 99 rollout')]);
    expect(search(p, `PR${NEL}99`)).toMatchObject({ outcome: 'no-match', hits: [] });
    expect(search(p, 'PR\n99')).toMatchObject({ outcome: 'no-match', hits: [] });
  });
});

describe('variation selectors stay meaningful in ordinary titles', () => {
  it('a title with a variation selector is not merged with the bare character', () => {
    const p = projectionOf([titled(3, KUZU), titled(4, `${KUZU}${VS17}`)]);
    expect(search(p, `${KUZU}${VS17}`)).toMatchObject({ outcome: 'match', hits: [{ identity: { sourceRef: 'github:kemetra-labs/backstage-os#pull/4' } }] });
    expect(search(p, KUZU)).toMatchObject({ outcome: 'match', hits: [{ identity: { sourceRef: 'github:kemetra-labs/backstage-os#pull/3' } }] });
  });
});
