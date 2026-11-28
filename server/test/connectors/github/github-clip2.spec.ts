// COG-08 fifth review (Codex, 2026-11-27, commit 43ab9f0), observer side: the clip flag was computed from
// the raw text while the stored text was sanitized first, so a NUL removed by sanitizing made an unclipped
// title look clipped. Observers now also state `textClipped: false` explicitly, so retrieval can tell a
// new unclipped title from a legacy row with no flag. Failed on 43ab9f0.
import { randomUUID } from 'node:crypto';
import { clip, isClipped, observeRepository } from '../../../src/connectors/github/github.observer';
import { CLIP_LIMIT } from '../../../src/retrieval/retrieval.policy';
import { happyScript, OWNER_REPO, REPO_ID, ok, ScriptedTransport } from './github.fixture';

const NUL = String.fromCharCode(0);
const now = new Date('2026-11-25T11:55:00Z');

async function payloadFor(title: string): Promise<Record<string, unknown>> {
  const script = happyScript();
  script[`/repos/${OWNER_REPO}/pulls`] = ok([{ number: 1, title, state: 'open', draft: false, updated_at: '2026-11-25T11:00:00Z', html_url: null }]);
  const items = await observeRepository(new ScriptedTransport(script), { sourceId: randomUUID(), externalRef: OWNER_REPO, repositoryId: REPO_ID }, now);
  return items.find((i) => i.payload['kind'] === 'pull_request')!.payload;
}

describe('the clip flag agrees with the stored text', () => {
  it('a NUL removed by sanitizing does not make an unclipped title look clipped', () => {
    const title = `${'x'.repeat(295)} #123${NUL}`;
    expect(Array.from(clip(title))).toHaveLength(300);
    expect(isClipped(title)).toBe(false);
  });

  it('an unclipped title states textClipped: false; a clipped one states true', async () => {
    expect((await payloadFor('short title'))['textClipped']).toBe(false);
    expect((await payloadFor('x'.repeat(400)))['textClipped']).toBe(true);
  });
});

describe('retrieval knows the clip length the observers use', () => {
  it('CLIP_LIMIT equals the length clip() keeps', () => {
    expect(Array.from(clip('x'.repeat(CLIP_LIMIT + 50)))).toHaveLength(CLIP_LIMIT);
    expect(isClipped('x'.repeat(CLIP_LIMIT))).toBe(false);
    expect(isClipped('x'.repeat(CLIP_LIMIT + 1))).toBe(true);
  });
});
