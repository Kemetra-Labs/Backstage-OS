// Authorized evidence API (BACK-55 S3). Database mode only. The global AuthGuard (#76) requires a live
// session; WorkspaceGuard then requires a capability; every read is filtered by the caller's active
// source grants. Unknown and invisible records look the same: 404 for one record, an empty list for a
// filter. CSRF: the session cookie is SameSite=Strict and no CORS is enabled (same model as #76).
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequireCapability, WorkspaceGuard, type WorkspaceRequest } from '../auth/workspace.guard';
import type { WorkspacePrincipal } from '../auth/workspace-resolver';
import { IdempotencyConflictException } from '../errors/idempotency-conflict';
import { writeLimitKey, type WriteAction, type WriteRateLimiter } from '../http/write-rate-limiter';
import { decisionBody, noteBody } from './evidence.body';
import { EvidenceRepository, type WriteExtras } from './evidence.repository';
import {
  DECISION_LIMIT_DEFAULT,
  DECISION_LIMIT_MAX,
  IdempotencyConflictError,
  NotVisibleError,
  RefusedError,
  UUID,
  type DecisionPage,
} from './evidence.types';
import { idempotencyClaim, parseIdempotencyKey } from './idempotency';

export const EVIDENCE_REPOSITORY = Symbol('KAWALYS_EVIDENCE_REPOSITORY');
export const EVIDENCE_WRITE_LIMITER = Symbol('KAWALYS_EVIDENCE_WRITE_LIMITER');

type Req = WorkspaceRequest;

/** Set by WorkspaceGuard; its absence means a wiring error, never a pass. */
function workspaceOf(req: Req): WorkspacePrincipal {
  if (!req.workspace) throw new NotFoundException();
  return req.workspace;
}

const optionalId = (value: unknown): string | undefined | null =>
  value === undefined ? undefined : typeof value === 'string' ? value : null;

/** `limit` is absent (the default) or one decimal integer from 1 to the maximum; anything else is a 400. */
export function decisionLimit(value: unknown): number {
  if (value === undefined) return DECISION_LIMIT_DEFAULT;
  if (typeof value !== 'string' || !/^[0-9]{1,3}$/.test(value)) throw new BadRequestException();
  const n = Number(value);
  if (n < 1 || n > DECISION_LIMIT_MAX) throw new BadRequestException();
  return n;
}

/** `cursor` is absent (the first page) or one non-empty string; anything else is a 400. Its content is checked later. */
export function decisionCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new BadRequestException();
  return value;
}

@Controller()
@UseGuards(WorkspaceGuard)
export class EvidenceController {
  constructor(
    @Inject(EVIDENCE_REPOSITORY) private readonly repo: EvidenceRepository,
    @Inject(EVIDENCE_WRITE_LIMITER) private readonly writeLimiter: WriteRateLimiter,
  ) {}

  @Get('evidence')
  @RequireCapability('evidence.read')
  async list(@Req() req: Req, @Query() query: Record<string, unknown>) {
    const filter = {
      sourceId: optionalId(query['sourceId']),
      investigationId: optionalId(query['investigationId']),
      projectId: optionalId(query['projectId']),
      // BACK-148 (decision L2): one evidence type, matched exactly by the database, so an unknown or malformed value matches nothing.
      type: optionalId(query['type']),
    };
    // A repeated or non-string filter is treated like an unknown id: nothing matches.
    if (Object.values(filter).some((v) => v === null)) return { items: [] };
    const principal = workspaceOf(req);
    return { items: await this.repo.list(principal.workspaceId, principal.userId, filter as Record<string, string | undefined>) };
  }

  @Get('evidence/:id')
  @RequireCapability('evidence.read')
  async get(@Req() req: Req, @Param('id') id: string) {
    const principal = workspaceOf(req);
    const record = await this.repo.get(principal.workspaceId, principal.userId, id);
    if (!record) throw new NotFoundException();
    return record;
  }

  /**
   * Recent human decisions with who recorded them and when (BACK-59), newest first, one page at a time.
   * Read-only. The same visibility as GET /evidence on every page: an invisible decision is absent. A malformed
   * or repeated `investigationId` matches nothing, like the GET /evidence filter; a bad `limit`, or a `cursor`
   * that is malformed, repeated or was issued for another query, is a 400. The cursor is checked first, so a
   * malformed `investigationId` with any cursor is a 400 too (no cursor is ever issued for it).
   */
  @Get('decisions')
  @RequireCapability('evidence.read')
  async decisions(@Req() req: Req, @Query() query: Record<string, unknown>): Promise<DecisionPage> {
    const limit = decisionLimit(query['limit']);
    const cursor = decisionCursor(query['cursor']);
    const investigationId = optionalId(query['investigationId']);
    if (investigationId === null) {
      // No cursor is ever issued for a repeated filter, so one here is foreign.
      if (cursor !== undefined) throw new BadRequestException();
      return { items: [], nextCursor: null };
    }
    const principal = workspaceOf(req);
    try {
      return await this.repo.recentDecisions(principal.workspaceId, principal.userId, { investigationId, limit, cursor });
    } catch (err) {
      if (err instanceof RefusedError) throw new BadRequestException();
      throw err;
    }
  }

  @Post('investigations/:id/decisions')
  @RequireCapability('decision.create')
  @HttpCode(201)
  async decide(@Req() req: Req, @Param('id') investigationId: string, @Body() body: unknown) {
    if (!UUID.test(investigationId)) throw new NotFoundException();
    const input = decisionBody(body, investigationId);
    const key = parseIdempotencyKey(req.headers['idempotency-key']);
    const principal = workspaceOf(req);
    this.limit(principal, 'decision.create');
    const extras: WriteExtras = {
      clientRequestId: req.clientRequestId ?? null,
      idempotency: key === undefined ? undefined : idempotencyClaim('decision.recorded', key, input),
    };
    return written(() => this.repo.recordDecision(principal.workspaceId, principal.userId, input, req.requestId ?? null, extras));
  }

  /** A user-written Correlation or Hypothesis citing one source's visible evidence (BACK-50). */
  @Post('investigations/:id/notes')
  @RequireCapability('note.create')
  @HttpCode(201)
  async note(@Req() req: Req, @Param('id') investigationId: string, @Body() body: unknown) {
    if (!UUID.test(investigationId)) throw new NotFoundException();
    const input = noteBody(body, investigationId);
    const key = parseIdempotencyKey(req.headers['idempotency-key']);
    const principal = workspaceOf(req);
    this.limit(principal, 'note.create');
    const extras: WriteExtras = {
      clientRequestId: req.clientRequestId ?? null,
      idempotency: key === undefined ? undefined : idempotencyClaim('note.recorded', key, input),
    };
    return written(() => this.repo.recordNote(principal.workspaceId, principal.userId, input, req.requestId ?? null, extras));
  }

  /** 30 writes per minute per workspace, principal and action (BACK-172 G2), checked before the repository call. */
  private limit(principal: WorkspacePrincipal, action: WriteAction): void {
    if (!this.writeLimiter.tryAcquire(writeLimitKey(principal.workspaceId, principal.userId, action))) throw new HttpException('', 429);
  }
}

/** Invisible or absent answers 404; a rule broken over visible rows answers 400. Shared with POST /investigations. */
export async function written(write: () => Promise<string>): Promise<{ id: string }> {
  try {
    return { id: await write() };
  } catch (err) {
    if (err instanceof NotVisibleError) throw new NotFoundException();
    if (err instanceof RefusedError) throw new BadRequestException();
    if (err instanceof IdempotencyConflictError) throw new IdempotencyConflictException();
    throw err;
  }
}
