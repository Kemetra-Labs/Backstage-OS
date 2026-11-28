// COG-07 live search: ordering pinned with a fake repository (security review, 2026-11-27). A refused request
// (rate limit, a query of the wrong type, an empty or oversized query) never reaches the memory read.
import { HttpException } from '@nestjs/common';
import { CognitionController } from '../../src/cognition/cognition.controller';
import type { SignInRateLimiter } from '../../src/auth/sign-in-rate-limiter';
import type { WorkspaceRequest } from '../../src/auth/workspace.guard';
import { MemoryReadBudgetExceeded, type MemoryRepository } from '../../src/memory/memory.repository';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const req = { workspace: { workspaceId: '00000000-0000-4000-8000-0000000000aa', userId: '00000000-0000-4000-8000-0000000000bb' } } as unknown as WorkspaceRequest;

function harness(allow: boolean) {
  let reads = 0;
  const memory = { readVisible: async () => { reads++; return null; } } as unknown as MemoryRepository;
  const limiter = { tryAcquire: () => allow } as unknown as SignInRateLimiter;
  return { controller: new CognitionController(memory, limiter), reads: () => reads };
}

const statusOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : -1;
  }
};

describe('nothing refused reaches the memory read', () => {
  it('the rate limit is checked before the read', async () => {
    const h = harness(false);
    expect(await statusOf(h.controller.search(req, PROJECT, 'portfolio'))).toBe(429);
    expect(h.reads()).toBe(0);
  });

  it.each([
    ['missing', undefined],
    ['repeated', ['a', 'b']],
    ['object-shaped', { a: 'b' }],
    ['empty', ''],
    ['blank', '   '],
    ['oversized', 'a'.repeat(501)],
  ])('a %s query is refused with 400 before the read', async (_name, q) => {
    const h = harness(true);
    expect(await statusOf(h.controller.search(req, PROJECT, q))).toBe(400);
    expect(h.reads()).toBe(0);
  });

  it('an over-budget read is never turned into not found or an empty answer', async () => {
    const memory = { readVisible: async () => { throw new MemoryReadBudgetExceeded(); } } as unknown as MemoryRepository;
    const controller = new CognitionController(memory, { tryAcquire: () => true } as unknown as SignInRateLimiter);
    await expect(controller.search(req, PROJECT, 'portfolio')).rejects.toBeInstanceOf(MemoryReadBudgetExceeded);
  });

  it('a valid query reaches the read (control)', async () => {
    const h = harness(true);
    expect(await statusOf(h.controller.search(req, PROJECT, 'portfolio'))).toBe(404);
    expect(h.reads()).toBe(1);
  });
});
