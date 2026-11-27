// COG-07 live read (BACK-110, owner decision 2026-11-27): search over the reader's memory projection for one
// project. Database mode only, read-only. The global AuthGuard requires a live session; WorkspaceGuard requires
// `evidence.read` (no new capability). The persona header is never read. A project the caller may not see,
// one that does not exist and a malformed id all answer the same 404. Reads are rate limited per user, so the
// memory read is never an unbounded per-request cost. Search only: the COG-04 task engine stays unwired (no live plan source).
import { BadRequestException, Controller, Get, HttpException, Inject, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import { RequireCapability, WorkspaceGuard, type WorkspaceRequest } from '../auth/workspace.guard';
import type { SignInRateLimiter } from '../auth/sign-in-rate-limiter';
import { UUID } from '../evidence/evidence.types';
import type { MemoryRepository } from '../memory/memory.repository';
import { MAX_QUERY_CHARS } from '../retrieval/retrieval.policy';
import { search } from '../retrieval/retrieval.search';

export const COGNITION_MEMORY = Symbol('KAWALYS_COGNITION_MEMORY');
export const COGNITION_LIMITER = Symbol('KAWALYS_COGNITION_LIMITER');
export const COGNITION_READS_PER_MINUTE = 30;
const TOO_MANY_REQUESTS = 429;

export interface CognitionHit {
  /** Null when the item has no title. */
  readonly title: string | null;
  readonly kind: string;
  readonly sourceRef: string;
  readonly status: string;
  readonly tier: string;
}

export interface CognitionSearchBody {
  readonly query: string;
  readonly outcome: string;
  readonly totalMatches: number;
  readonly truncated: boolean;
  readonly hits: readonly CognitionHit[];
  readonly retrievalPolicyVersion: string;
}

@Controller('cognition')
@UseGuards(WorkspaceGuard)
export class CognitionController {
  constructor(
    @Inject(COGNITION_MEMORY) private readonly memory: MemoryRepository,
    // The sign-in limiter's fixed-window design, keyed here by user id.
    @Inject(COGNITION_LIMITER) private readonly limiter: SignInRateLimiter,
  ) {}

  @Get('projects/:projectId/search')
  @RequireCapability('evidence.read')
  async search(@Req() req: WorkspaceRequest, @Param('projectId') projectId: string, @Query('q') q: unknown): Promise<CognitionSearchBody> {
    // Set by WorkspaceGuard; its absence is a wiring error, never a pass.
    const p = req.workspace;
    if (!p) throw new NotFoundException();
    // Counted before any read, so a flood never reaches the database.
    if (!this.limiter.tryAcquire(p.userId)) throw new HttpException('', TOO_MANY_REQUESTS);
    // Cheap checks before the read, so a refused query never costs a database round trip (security review).
    if (typeof q !== 'string' || q.trim() === '' || q.length > MAX_QUERY_CHARS) throw new BadRequestException();
    if (!UUID.test(projectId)) throw new NotFoundException();
    const projection = await this.memory.readVisible({ workspaceId: p.workspaceId, userId: p.userId, projectId });
    if (!projection) throw new NotFoundException();
    const r = search(projection, q);
    if (r.outcome === 'invalid-query') throw new BadRequestException();
    return {
      query: q,
      outcome: r.outcome,
      totalMatches: r.totalMatches,
      truncated: r.truncated,
      hits: r.hits.map((h) => ({ title: h.title, kind: h.kind, sourceRef: h.identity.sourceRef, status: h.status, tier: h.tier })),
      retrievalPolicyVersion: r.retrievalPolicyVersion,
    };
  }
}
