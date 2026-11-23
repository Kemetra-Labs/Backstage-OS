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
import { EvidenceRepository, type DecisionInput } from './evidence.repository';
import { NotVisibleError, UUID } from './evidence.types';

export const EVIDENCE_REPOSITORY = Symbol('KAWALYS_EVIDENCE_REPOSITORY');

type Req = WorkspaceRequest;

/** Set by WorkspaceGuard; its absence means a wiring error, never a pass. */
function workspaceOf(req: Req): WorkspacePrincipal {
  if (!req.workspace) throw new NotFoundException();
  return req.workspace;
}

const optionalId = (value: unknown): string | undefined | null =>
  value === undefined ? undefined : typeof value === 'string' ? value : null;

/** No NUL and no unpaired surrogate: PostgreSQL jsonb would reject them later with a 500. */
function storableText(v: string): boolean {
  return !v.includes(String.fromCharCode(0)) && (v as unknown as { isWellFormed(): boolean }).isWellFormed();
}

function decisionBody(body: unknown, investigationId: string): DecisionInput {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const { decision, rationale, evidenceIds } = b;
  const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && storableText(v);
  if (!text(decision, 2000) || !text(rationale, 4000)) throw new BadRequestException();
  if (!Array.isArray(evidenceIds) || evidenceIds.length > 50 || !evidenceIds.every((id) => typeof id === 'string')) {
    throw new BadRequestException();
  }
  return { investigationId, decision: decision as string, rationale: rationale as string, evidenceIds: evidenceIds as string[] };
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

  @Post('investigations/:id/decisions')
  @RequireCapability('decision.create')
  @HttpCode(201)
  async decide(@Req() req: Req, @Param('id') investigationId: string, @Body() body: unknown) {
    if (!UUID.test(investigationId)) throw new NotFoundException();
    const input = decisionBody(body, investigationId);
    const principal = workspaceOf(req);
    try {
      const id = await this.repo.recordDecision(principal.workspaceId, principal.userId, input, req.requestId ?? null);
      return { id };
    } catch (err) {
      if (err instanceof NotVisibleError) throw new NotFoundException();
      throw err;
    }
  }
}
