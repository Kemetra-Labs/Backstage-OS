// GitHub refresh scheduler (BACK-52 slice A, decision S), unit level: stubbed repository, no database, no network.
import type { EvidenceRepository } from '../../../src/evidence/evidence.repository';
import { configuredApprovalPolicy } from '../../../src/evidence/source-approval';
import { GithubRefreshScheduler, type RefreshActor } from '../../../src/connectors/github/github.scheduler';
import type { GitHubReadTransport } from '../../../src/connectors/github/github.transport';
import { happyScript, OWNER_REPO, REPO_ID, ScriptedTransport } from './github.fixture';

const actor: RefreshActor = { workspaceId: '11111111-1111-4111-8111-111111111111', actor: '22222222-2222-4222-8222-222222222222' };
const policy = configuredApprovalPolicy({ KAWALYS_APPROVED_SOURCES: `p=github:${OWNER_REPO}#${REPO_ID}` });
const SOURCE = '33333333-3333-4333-8333-333333333333';

/** Just the repository methods the runner and scheduler call. */
function stubRepo(over: { sources?: string[]; listFails?: boolean; ingestFails?: boolean } = {}) {
  const log = { lists: 0, ingests: 0 };
  const repo = {
    githubSourcesForRefresh: async () => {
      log.lists += 1;
      if (over.listFails) throw new Error('db down: postgres://user:SECRETPASSWORD@host/db');
      return (over.sources ?? [SOURCE]).map((sourceId) => ({ sourceId, projectId: 'p', projectKey: 'p', identity: { provider: 'github', externalRef: OWNER_REPO } }));
    },
    sourceForRefresh: async (_ws: string, sourceId: string) => ({ sourceId, projectId: 'p', projectKey: 'p', identity: { provider: 'github', externalRef: OWNER_REPO } }),
    hasActiveGrant: async () => true,
    ingest: async (_ws: string, items: unknown[]) => {
      log.ingests += 1;
      if (over.ingestFails) throw new Error('boom SECRETPASSWORD');
      return items.map(() => 'id');
    },
  } as unknown as EvidenceRepository;
  return { repo, log };
}

interface FakeTimers {
  fn: (() => void) | undefined;
  ms: number;
  sets: number;
  cleared: number;
}

const build = (repo: EvidenceRepository, extra: { timers?: FakeTimers; owner?: () => Promise<RefreshActor | null>; makeTransport?: () => GitHubReadTransport; intervalMs?: number; lines?: string[] } = {}) =>
  new GithubRefreshScheduler({
    repo,
    policy,
    owner: extra.owner ?? (async () => actor),
    makeTransport: extra.makeTransport ?? (() => new ScriptedTransport(happyScript())),
    intervalMs: extra.intervalMs ?? 1_000_000,
    now: () => new Date('2026-11-28T12:00:00Z'),
    log: (line) => extra.lines?.push(line),
    ...(extra.timers
      ? {
          timers: {
            set: (fn: () => void, ms: number) => {
              extra.timers!.fn = fn;
              extra.timers!.ms = ms;
              extra.timers!.sets += 1;
              return extra.timers!.sets;
            },
            clear: () => {
              extra.timers!.cleared += 1;
              extra.timers!.fn = undefined;
            },
          },
        }
      : {}),
  });


describe('GithubRefreshScheduler', () => {
  it('runOnce refreshes every GitHub source of the owner through the guarded runner', async () => {
    const { repo, log } = stubRepo({ sources: [SOURCE, '44444444-4444-4444-8444-444444444444'] });
    const s = build(repo);
    expect(await s.runOnce()).toBe('ran');
    expect(log.ingests).toBe(2);
  });

  it('does nothing while no owner is bound', async () => {
    const { repo, log } = stubRepo();
    const s = build(repo, { owner: async () => null });
    expect(await s.runOnce()).toBe('ran');
    expect(log.lists).toBe(0);
  });

  it('skips a tick while a run is in progress (one run at a time) and runs again afterwards', async () => {
    const { repo, log } = stubRepo();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const s = build(repo, {
      owner: async () => {
        await gate;
        return actor;
      },
    });
    const first = s.runOnce();
    expect(await s.runOnce()).toBe('skipped');
    expect(await s.runOnce()).toBe('skipped');
    release();
    expect(await first).toBe('ran');
    expect(log.ingests).toBe(1);
    expect(await s.runOnce()).toBe('ran');
    expect(log.ingests).toBe(2);
  });

  it('ticks on its interval after start (injected timer, no real waiting), and stops ticking after stop', async () => {
    const { repo, log } = stubRepo();
    const timers: FakeTimers = { fn: undefined, ms: 0, sets: 0, cleared: 0 };
    const s = build(repo, { timers, intervalMs: 900_000 });
    expect(s.started).toBe(false);
    s.start();
    s.start(); // a second start does not add a second timer
    expect(s.started).toBe(true);
    expect(timers).toMatchObject({ sets: 1, ms: 900_000 });
    timers.fn!();
    await s.whenIdle();
    timers.fn!();
    await s.whenIdle();
    expect(log.ingests).toBe(2);
    s.stop();
    expect(s.started).toBe(false);
    expect(timers).toMatchObject({ cleared: 1, fn: undefined });
    expect(await s.runOnce()).toBe('ran'); // a stopped scheduler starts no source
    expect(log.ingests).toBe(2);
  });

  it('stops on the Nest lifecycle hooks', () => {
    const { repo } = stubRepo();
    for (const hook of ['onModuleDestroy', 'onApplicationShutdown'] as const) {
      const s = build(repo, { intervalMs: 1000 });
      s.start();
      s[hook]();
      expect(s.started).toBe(false);
    }
  });

  it('refuses a non-positive or fractional interval', () => {
    const { repo } = stubRepo();
    for (const intervalMs of [0, -5, 1.5, Number.NaN, 2_147_483_648]) expect(() => build(repo, { intervalMs })).toThrow(RangeError);
  });

  it('logs a failure as one fixed line with the error class name only, never the message', async () => {
    const lines: string[] = [];
    const listing = stubRepo({ listFails: true });
    await build(listing.repo, { lines }).runOnce();
    const ingesting = stubRepo({ ingestFails: true });
    await build(ingesting.repo, { lines }).runOnce();
    expect(lines).toEqual(['kawalys-bff: github refresh failed (Error)', 'kawalys-bff: github refresh failed (Error)']);
    expect(lines.join('\n')).not.toContain('SECRETPASSWORD');
  });

  it('one failing source does not stop the next, and the pass still releases the lock', async () => {
    const lines: string[] = [];
    let n = 0;
    const { repo, log } = stubRepo({ sources: [SOURCE, '44444444-4444-4444-8444-444444444444'] });
    const s = build(repo, {
      lines,
      makeTransport: () => {
        n += 1;
        if (n === 1) throw new TypeError('no transport SECRETPASSWORD');
        return new ScriptedTransport(happyScript());
      },
    });
    expect(await s.runOnce()).toBe('ran');
    expect(log.ingests).toBe(1);
    expect(lines).toEqual(['kawalys-bff: github refresh failed (TypeError)']);
    expect(await s.runOnce()).toBe('ran');
  });
});
