import { Module, type DynamicModule } from '@nestjs/common';
import { WORKSPACE_RESOLVER, WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceResolver } from '../auth/workspace-resolver';
import { EvidenceController, EVIDENCE_REPOSITORY } from './evidence.controller';
import type { EvidenceRepository } from './evidence.repository';

/** Registered only with the database. The global AuthGuard (AuthModule) protects every route here. */
@Module({})
export class EvidenceModule {
  static register(repo: EvidenceRepository, workspaces: WorkspaceResolver): DynamicModule {
    return {
      module: EvidenceModule,
      controllers: [EvidenceController],
      providers: [{ provide: EVIDENCE_REPOSITORY, useValue: repo }, { provide: WORKSPACE_RESOLVER, useValue: workspaces }, WorkspaceGuard],
    };
  }
}
