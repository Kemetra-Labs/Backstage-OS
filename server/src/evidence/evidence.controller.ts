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
import { decisionBody, noteBody } from './evidence.body';
import { EvidenceRepository } from './evidence.repository';
import { DECISION_LIMIT_DEFAULT, DECISION_LIMIT_MAX, NotVisibleError, RefusedError, UUID } from './evidence.types';

export const EVIDENCE_REPOSITORY = Symbol('KAWALYS_EVIDENCE_REPOSITORY');

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

@Controller()
@UseGuards(WorkspaceGuard)
export class EvidenceController {
  constructor(@Inject(EVIDENCE_REPOSITORY) private readonly repo: EvidenceRepository) {}

  @Get('evidence')
  @RequireCapability('evidence.read')
  async list(@Req() req: Req, @Query() query: Record<string, unknown>) {
    const filter = {
      sourceId: optionalId(query['sourceId']),
      investigationId: optionalId(query['investigationId']),
      projectId: optionalId(query['projectId']),
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
   * Recent human decisions with who recorded them and when (BACK-59), newest first. Read-only. The same
   * visibility as GET /evidence: an invisible decision is absent. A malformed or repeated
   * `investigationId` matches nothing, like the GET /evidence filter; a bad `limit` is a 400.
   */
  @Get('decisions')
  @RequireCapability('evidence.read')
  async decisions(@Req() req: Req, @Query() query: Record<string, unknown>) {
    const limit = decisionLimit(query['limit']);
    const investigationId = optionalId(query['investigationId']);
    if (investigationId === null) return { items: [] };
    const principal = workspaceOf(req);
    return { items: await this.repo.recentDecisions(principal.workspaceId, principal.userId, { investigationId, limit }) };
  }

  @Post('investigations/:id/decisions')
  @RequireCapability('decision.create')
  @HttpCode(201)
  async decide(@Req() req: Req, @Param('id') investigationId: string, @Body() body: unknown) {
    if (!UUID.test(investigationId)) throw new NotFoundException();
    const input = decisionBody(body, investigationId);
    const principal = workspaceOf(req);
    return written(() => this.repo.recordDecision(principal.workspaceId, principal.userId, input, req.requestId ?? null));
  }

  /** A user-written Correlation or Hypothesis citing one source's visible evidence (BACK-50). */
  @Post('investigations/:id/notes')
  @RequireCapability('note.create')
  @HttpCode(201)
  async note(@Req() req: Req, @Param('id') investigationId: string, @Body() body: unknown) {
    if (!UUID.test(investigationId)) throw new NotFoundException();
    const input = noteBody(body, investigationId);
    const principal = workspaceOf(req);
    return written(() => this.repo.recordNote(principal.workspaceId, principal.userId, input, req.requestId ?? null));
  }
}

/** Invisible or absent answers 404; a rule broken over visible rows answers 400. */
async function written(write: () => Promise<string>): Promise<{ id: string }> {
  try {
    return { id: await write() };
  } catch (err) {
    if (err instanceof NotVisibleError) throw new NotFoundException();
    if (err instanceof RefusedError) throw new BadRequestException();
    throw err;
  }
}
