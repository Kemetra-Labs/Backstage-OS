// COG-08 sixth review (Codex, 2026-11-27, commit f005f59) regressions for COG-02: a repository read at an
// effective time between two runs compared markers with a later run's observation (after E), so a failure
// or ambiguity before E was missed and the read said verified; and the as-of view kept a run-wide
// firstKnownAt. Each failed on f005f59.
import { project } from '../../src/memory/memory.projector';
import { at, GH, REPO, repo, request, status } from './memory.fixture';

const readAt1145 = (rows: Parameters<typeof project>[0]) =>
  project(rows, request({ effectiveAt: at('11:45'), knownAt: at('12:00'), evaluationAt: at('11:46') })).items[0]!;

describe('a repository read between runs compares markers with the selected run', () => {
  it('main 11:40, failed read 11:43, trunk 11:55; read at 11:45 is unknown', () => {
    const item = readAt1145([
      repo({ defaultBranch: 'main' }, { id: 'a', observedAt: at('11:40') }),
      status(GH, REPO, 'error', 'timeout', { id: 'f', observedAt: at('11:43') }),
      repo({ defaultBranch: 'trunk' }, { id: 'b', observedAt: at('11:55') }),
    ]);
    expect(item.status).toBe('unknown');
  });

  it('without the failed read it is verified on main (control)', () => {
    const item = readAt1145([
      repo({ defaultBranch: 'main' }, { id: 'a', observedAt: at('11:40') }),
      repo({ defaultBranch: 'trunk' }, { id: 'b', observedAt: at('11:55') }),
    ]);
    expect(item).toMatchObject({ status: 'verified', current: { payload: { defaultBranch: 'main' } } });
  });
});

describe('the as-of view takes both known times from the first row', () => {
  it('firstKnownAt and lastKnownAt both come from the first row', () => {
    const rows = [
      repo({}, { id: 'a', observedAt: at('11:40'), receivedAt: at('11:58') }),
      repo({}, { id: 'b', observedAt: at('11:55'), receivedAt: at('11:56') }),
    ];
    const item = project(rows, request({ effectiveAt: at('11:40'), knownAt: at('12:00'), evaluationAt: at('11:41') })).items[0]!;
    expect(item.current).toMatchObject({ firstKnownAt: at('11:58'), lastKnownAt: at('11:58') });
  });
});
