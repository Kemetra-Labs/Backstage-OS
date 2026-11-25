// Investigation API (BACK-50 server slice). Database mode only, read-only. The global AuthGuard
// requires a live session; WorkspaceGuard requires `evidence.read` (no new capability). Absent,
// malformed and invisible ids look the same (404). The persona header is never read.
// Evidence is returned as stored, with `type` and `state` unchanged: those are the badges. No health
// is computed here. Connector observations that belong to no investigation are at /portfolio/:id.
import { Controller, Get, Inject, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import { RequireCapability, WorkspaceGuard, type WorkspaceRequest } from '../auth/workspace.guard';
import type { EvidenceRepository } from '../evidence/evidence.repository';
import type { InvestigationRepository } from './investigation.repository';

export const INVESTIGATION_REPOSITORY = Symbol('KAWALYS_INVESTIGATION_REPOSITORY');
export const INVESTIGATION_EVIDENCE = Symbol('KAWALYS_INVESTIGATION_EVIDENCE');

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
  ) {}

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
