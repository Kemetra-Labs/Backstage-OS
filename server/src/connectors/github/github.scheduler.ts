// In-process GitHub refresh scheduler (BACK-52 slice A, decision S). Off unless create-app.ts starts it, which it does
// only with a database, a complete GitHub App configuration and KAWALYS_GITHUB_REFRESH_MINUTES (>= 15).
// No HTTP route triggers it. One run at a time: a tick that finds a run in progress is skipped. Every GitHub source
// of the owner's workspace is handed to the guarded runner, which decides (approval with pinned id, active grant).
// A failure is logged as ONE fixed line with the error class name only: never a message, which could carry a secret.
import { DynamicModule, Module, type OnApplicationShutdown, type OnModuleDestroy } from '@nestjs/common';
import type { EvidenceRepository } from '../../evidence/evidence.repository';
import type { SourceApprovalPolicy } from '../../evidence/source-approval';
import { refreshSource, type GitHubTarget } from './github.runner';
import type { GitHubReadTransport } from './github.transport';

/** Whose workspace to refresh and on whose grant. Null: no owner is bound yet, nothing to do. */
export interface RefreshActor {
  readonly workspaceId: string;
  readonly actor: string;
}

export interface SchedulerDeps {
  readonly repo: EvidenceRepository;
  readonly policy: SourceApprovalPolicy;
  readonly owner: () => Promise<RefreshActor | null>;
  readonly makeTransport: (target: GitHubTarget) => GitHubReadTransport;
  readonly intervalMs: number;
  /** Timer seam so a test can drive ticks without waiting. Default: setInterval (unref'd) and clearInterval. */
  readonly timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
  readonly now?: () => Date;
  /** One line per call. Default: console.error. */
  readonly log?: (line: string) => void;
}

export const GITHUB_SCHEDULER = Symbol('GITHUB_SCHEDULER');
const MAX_TIMER_MS = 2_147_483_647;

export class GithubRefreshScheduler implements OnModuleDestroy, OnApplicationShutdown {
  private timer: unknown;
  private current: Promise<unknown> = Promise.resolve();
  private running = false;
  private stopped = false;

  constructor(private readonly deps: SchedulerDeps) {
    // Above 2^31-1 ms Node clamps a timer to 1 ms, which would turn the scheduler into a busy loop against GitHub.
    if (!Number.isInteger(deps.intervalMs) || deps.intervalMs < 1 || deps.intervalMs > MAX_TIMER_MS) throw new RangeError('scheduler interval out of range');
  }

  get started(): boolean {
    return this.timer !== undefined;
  }

  start(): void {
    if (this.timer !== undefined) return;
    this.stopped = false;
    const tick = () => {
      this.current = this.runOnce();
    };
    const timers = this.deps.timers;
    if (timers) this.timer = timers.set(tick, this.deps.intervalMs);
    else {
      const handle = setInterval(tick, this.deps.intervalMs);
      handle.unref();
      this.timer = handle;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) {
      if (this.deps.timers) this.deps.timers.clear(this.timer);
      else clearInterval(this.timer as NodeJS.Timeout);
    }
    this.timer = undefined;
  }

  /** Resolves when the run started by the latest tick has finished (tests await it instead of sleeping). */
  whenIdle(): Promise<unknown> {
    return this.current;
  }

  onModuleDestroy(): void {
    this.stop();
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  /** One pass over the workspace's GitHub sources. `skipped` when a pass is already running. Never throws. */
  async runOnce(): Promise<'ran' | 'skipped'> {
    if (this.running) return 'skipped';
    this.running = true;
    try {
      const target = await this.deps.owner();
      if (target === null) return 'ran';
      const sources = await this.deps.repo.githubSourcesForRefresh(target.workspaceId);
      for (const source of sources) {
        // Stopped while a pass was running: do not begin another source.
        if (this.stopped) break;
        await this.refreshOne(target, source.sourceId);
      }
    } catch (err) {
      this.logFailure(err);
    } finally {
      this.running = false;
    }
    return 'ran';
  }

  private async refreshOne(target: RefreshActor, sourceId: string): Promise<void> {
    try {
      await refreshSource({
        repo: this.deps.repo,
        policy: this.deps.policy,
        workspaceId: target.workspaceId,
        actor: target.actor,
        sourceId,
        makeTransport: this.deps.makeTransport,
        now: this.deps.now ?? (() => new Date()),
      });
    } catch (err) {
      this.logFailure(err);
    }
  }

  private logFailure(err: unknown): void {
    const name = err instanceof Error && /^\w{1,64}$/.test(err.constructor.name) ? err.constructor.name : 'unknown';
    (this.deps.log ?? ((line) => console.error(line)))(`kawalys-bff: github refresh failed (${name})`);
  }
}

/** Registers the scheduler so Nest stops it when the app closes (its lifecycle hooks run on app.close()). */
@Module({})
export class GithubSchedulerModule {
  static register(scheduler: GithubRefreshScheduler): DynamicModule {
    return { module: GithubSchedulerModule, providers: [{ provide: GITHUB_SCHEDULER, useValue: scheduler }] };
  }
}
