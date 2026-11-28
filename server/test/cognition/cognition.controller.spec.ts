// COG-07 live search: ordering pinned with a fake repository (security review, 2026-11-27). A refused request
// (rate limit, a query of the wrong type, an empty or oversized query) never reaches the memory read.
import { HttpException } from '@nestjs/common';
import { CognitionController } from '../../src/cognition/cognition.controller';
import { ReadSlots } from '../../src/cognition/read-slots';
import type { SignInRateLimiter } from '../../src/auth/sign-in-rate-limiter';
import type { WorkspaceRequest } from '../../src/auth/workspace.guard';
import { MemoryReadBudgetExceeded, type MemoryRepository } from '../../src/memory/memory.repository';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const req = { workspace: { workspaceId: '00000000-0000-4000-8000-0000000000aa', userId: '00000000-0000-4000-8000-0000000000bb' } } as unknown as WorkspaceRequest;

function harness(allow: boolean) {
  let reads = 0;
  const memory = { readVisible: async () => { reads++; return null; } } as unknown as MemoryRepository;
  const limiter = { tryAcquire: () => allow } as unknown as SignInRateLimiter;
  const slots = new ReadSlots(4);
  return { controller: new CognitionController(memory, limiter, slots), reads: () => reads, slots };
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
    const controller = new CognitionController(memory, { tryAcquire: () => true } as unknown as SignInRateLimiter, new ReadSlots(4));
    await expect(controller.search(req, PROJECT, 'portfolio')).rejects.toBeInstanceOf(MemoryReadBudgetExceeded);
  });

  it('at capacity the read is refused at once and never reaches the repository', async () => {
    let reads = 0;
    const memory = { readVisible: async () => { reads++; return null; } } as unknown as MemoryRepository;
    const slots = new ReadSlots(1);
    expect(slots.tryAcquire()).toBe(true); // another read holds the only slot
    const controller = new CognitionController(memory, { tryAcquire: () => true } as unknown as SignInRateLimiter, slots);
    expect(await statusOf(controller.search(req, PROJECT, 'portfolio'))).toBe(503);
    expect(reads).toBe(0);
  });

  it('a read that finds the project frees its slot', async () => {
    const memory = { readVisible: async () => ({ items: [] }) } as unknown as MemoryRepository;
    const slots = new ReadSlots(1);
    const controller = new CognitionController(memory, { tryAcquire: () => true } as unknown as SignInRateLimiter, slots);
    await statusOf(controller.search(req, PROJECT, 'portfolio'));
    expect(slots.inFlight).toBe(0);
  });

  it('a read that throws still frees its slot', async () => {
    const memory = { readVisible: async () => { throw new MemoryReadBudgetExceeded(); } } as unknown as MemoryRepository;
    const slots = new ReadSlots(1);
    const controller = new CognitionController(memory, { tryAcquire: () => true } as unknown as SignInRateLimiter, slots);
    await expect(controller.search(req, PROJECT, 'portfolio')).rejects.toBeInstanceOf(MemoryReadBudgetExceeded);
    expect(slots.inFlight).toBe(0);
  });

  it('a valid query reaches the read (control)', async () => {
    const h = harness(true);
    expect(await statusOf(h.controller.search(req, PROJECT, 'portfolio'))).toBe(404);
    expect(h.reads()).toBe(1);
    expect(h.slots.inFlight).toBe(0); // a not-found read frees its slot too
  });
});
