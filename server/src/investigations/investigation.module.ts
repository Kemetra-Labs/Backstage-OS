import { Module, type DynamicModule } from '@nestjs/common';
import { WORKSPACE_RESOLVER, WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceResolver } from '../auth/workspace-resolver';
import type { EvidenceRepository } from '../evidence/evidence.repository';
import { WriteRateLimiter } from '../http/write-rate-limiter';
import { INVESTIGATION_EVIDENCE, INVESTIGATION_REPOSITORY, INVESTIGATION_WRITE_LIMITER, InvestigationController } from './investigation.controller';
import type { InvestigationRepository } from './investigation.repository';

/** Registered only with the database. The global AuthGuard (AuthModule) protects every route here. */
@Module({})
export class InvestigationModule {
  static register(investigations: InvestigationRepository, evidence: EvidenceRepository, workspaces: WorkspaceResolver, now: () => number = Date.now): DynamicModule {
    return {
      module: InvestigationModule,
      controllers: [InvestigationController],
      providers: [
        { provide: INVESTIGATION_REPOSITORY, useValue: investigations },
        { provide: INVESTIGATION_EVIDENCE, useValue: evidence },
        // BACK-148 M: case creation shares the BACK-172 write limit design (30 per minute per workspace, principal and action).
        { provide: INVESTIGATION_WRITE_LIMITER, useValue: new WriteRateLimiter(now) },
        { provide: WORKSPACE_RESOLVER, useValue: workspaces },
        WorkspaceGuard,
      ],
    };
  }
}
