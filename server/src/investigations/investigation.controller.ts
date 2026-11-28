// Investigation API (BACK-50 server slice). Database mode only. The global AuthGuard requires a live session; the reads
// need `evidence.read`, and the one write, POST /investigations (BACK-148 decision M), needs `investigation.create`
// (owner only). Absent, malformed and invisible ids look the same (404). The persona header is never read.
// Evidence is returned as stored, with `type` and `state` unchanged: those are the badges. No health
// is computed here. Connector observations that belong to no investigation are at /portfolio/:id.
import { Body, Controller, Get, HttpCode, HttpException, Inject, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequireCapability, WorkspaceGuard, type WorkspaceRequest } from '../auth/workspace.guard';
import { written } from '../evidence/evidence.controller';
import type { EvidenceRepository, WriteExtras } from '../evidence/evidence.repository';
import { idempotencyClaim, parseIdempotencyKey } from '../evidence/idempotency';
import { writeLimitKey, type WriteRateLimiter } from '../http/write-rate-limiter';
import { investigationBody } from './investigation.body';
import type { InvestigationRepository } from './investigation.repository';

export const INVESTIGATION_REPOSITORY = Symbol('KAWALYS_INVESTIGATION_REPOSITORY');
export const INVESTIGATION_EVIDENCE = Symbol('KAWALYS_INVESTIGATION_EVIDENCE');
export const INVESTIGATION_WRITE_LIMITER = Symbol('KAWALYS_INVESTIGATION_WRITE_LIMITER');

function principalOf(req: WorkspaceRequest) {
  // Set by WorkspaceGuard; its absence is a wiring error, never a pass.
  if (!req.workspace) throw new NotFoundException();
  return req.workspace;
}

/** `projectId` must be absent or a single string; a repeated or non-string value matches nothing. */
export function projectFilter(query: Record<string, unknown>): { projectId?: string } | null {
  const v = query['projectId'];
  if (v === undefined) return {};
  return typeof v === 'string' ? { projectId: v } : null;
}

@Controller('investigations')
@UseGuards(WorkspaceGuard)
export class InvestigationController {
  constructor(
    @Inject(INVESTIGATION_REPOSITORY) private readonly investigations: InvestigationRepository,
    @Inject(INVESTIGATION_EVIDENCE) private readonly evidence: EvidenceRepository,
    @Inject(INVESTIGATION_WRITE_LIMITER) private readonly writeLimiter: WriteRateLimiter,
  ) {}

  /**
   * Owner case creation (BACK-148 decision M) behind the BACK-172 shared controls: body validated first (400), then the
   * Idempotency-Key header (400 if malformed), then the write limit (429), then the repository, which requires a visible
   * project (404 otherwise, nothing written) and answers a replay with the first id (422 on a conflicting reuse). The
   * audit row carries the server request id and, when given, the client correlation id and the key and request hashes.
   */
  @Post()
  @RequireCapability('investigation.create')
  @HttpCode(201)
  async create(@Req() req: WorkspaceRequest, @Body() body: unknown) {
    const input = investigationBody(body);
    const key = parseIdempotencyKey(req.headers['idempotency-key']);
    const p = principalOf(req);
    if (!this.writeLimiter.tryAcquire(writeLimitKey(p.workspaceId, p.userId, 'investigation.create'))) throw new HttpException('', 429);
    const extras: WriteExtras = {
      clientRequestId: req.clientRequestId ?? null,
      idempotency: key === undefined ? undefined : idempotencyClaim('investigation.created', key, input),
    };
    return written(() => this.evidence.createVisibleInvestigation(p.workspaceId, p.userId, input, req.requestId ?? null, extras));
  }

  @Get()
  @RequireCapability('evidence.read')
  async list(@Req() req: WorkspaceRequest, @Query() query: Record<string, unknown>) {
    const filter = projectFilter(query);
    if (!filter) return { items: [] };
    const p = principalOf(req);
    return { items: await this.investigations.list(p.workspaceId, p.userId, filter) };
  }

  @Get(':id')
  @RequireCapability('evidence.read')
  async get(@Req() req: WorkspaceRequest, @Param('id') id: string) {
    const p = principalOf(req);
    const investigation = await this.investigations.get(p.workspaceId, p.userId, id);
    if (!investigation) throw new NotFoundException();
    // The evidence list applies its own per-record visibility (source grants, citation rule).
    const evidence = await this.evidence.list(p.workspaceId, p.userId, { investigationId: investigation.id });
    return { ...investigation, evidence };
  }
}
