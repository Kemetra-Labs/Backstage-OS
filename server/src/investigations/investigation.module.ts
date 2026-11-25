import { Module, type DynamicModule } from '@nestjs/common';
import { WORKSPACE_RESOLVER, WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceResolver } from '../auth/workspace-resolver';
import type { EvidenceRepository } from '../evidence/evidence.repository';
import { INVESTIGATION_EVIDENCE, INVESTIGATION_REPOSITORY, InvestigationController } from './investigation.controller';
import type { InvestigationRepository } from './investigation.repository';

/** Registered only with the database. The global AuthGuard (AuthModule) protects every route here. */
@Module({})
export class InvestigationModule {
  static register(investigations: InvestigationRepository, evidence: EvidenceRepository, workspaces: WorkspaceResolver): DynamicModule {
    return {
      module: InvestigationModule,
      controllers: [InvestigationController],
      providers: [
        { provide: INVESTIGATION_REPOSITORY, useValue: investigations },
        { provide: INVESTIGATION_EVIDENCE, useValue: evidence },
        { provide: WORKSPACE_RESOLVER, useValue: workspaces },
        WorkspaceGuard,
      ],
    };
  }
}
