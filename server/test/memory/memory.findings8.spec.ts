// COG-08 tenth review (Codex, 2026-11-27, commit fecc299) regression for COG-02: a payload field outside
// the content key (textClipped, which retrieval uses to suppress a mention at a clip cut) changed on the
// current observation without changing the fingerprint, under pure-projector replacement input. The
// fingerprint now covers the current run's whole payload. Failed on fecc299.
import { project, validateAtRead } from '../../src/memory/memory.projector';
import { at, pr, request } from './memory.fixture';

describe('the fingerprint covers the current run payload', () => {
  it('flipping textClipped on the current observation changes the fingerprint', () => {
    const req = request();
    const row = (textClipped: boolean) => {
      const r = pr(1, { title: `${'x'.repeat(296)} #2`, updatedAt: at('11:00') }, { id: 'p1', observedAt: at('11:55') });
      return { ...r, payload: { ...r.payload, textClipped } };
    };
    const before = project([row(false)], req);
    expect(validateAtRead(before, [row(true)], req)).toBe(false);
  });
});
