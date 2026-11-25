// Portfolio API (BACK-49 slice 2). Database mode only, read-only. The global AuthGuard requires a
// live session; WorkspaceGuard requires `evidence.read` (no new capability). A project that does
// not exist and one the caller may not see look the same: 404. The persona header is never read.
import { Controller, Get, Inject, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { RequireCapability, WorkspaceGuard, type WorkspaceRequest } from '../auth/workspace.guard';
import { PortfolioRepository } from './portfolio.repository';

export const PORTFOLIO_REPOSITORY = Symbol('KAWALYS_PORTFOLIO_REPOSITORY');

function principalOf(req: WorkspaceRequest) {
  // Set by WorkspaceGuard; its absence is a wiring error, never a pass.
  if (!req.workspace) throw new NotFoundException();
  return req.workspace;
}

@Controller('portfolio')
@UseGuards(WorkspaceGuard)
export class PortfolioController {
  constructor(@Inject(PORTFOLIO_REPOSITORY) private readonly repo: PortfolioRepository) {}

  /** Visible projects with per-source read state and open-item counts; no items. */
  @Get()
  @RequireCapability('evidence.read')
  async list(@Req() req: WorkspaceRequest) {
    const p = principalOf(req);
    return { projects: await this.repo.list(p.workspaceId, p.userId, { withItems: false }) };
  }

  /** One visible project with the items of each source's latest read. */
  @Get(':projectId')
  @RequireCapability('evidence.read')
  async get(@Req() req: WorkspaceRequest, @Param('projectId') projectId: string) {
    const p = principalOf(req);
    const [project] = await this.repo.list(p.workspaceId, p.userId, { projectId, withItems: true });
    if (!project) throw new NotFoundException();
    return project;
  }
}
