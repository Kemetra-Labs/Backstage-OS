import { Module, type DynamicModule } from '@nestjs/common';
import { WORKSPACE_RESOLVER, WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceResolver } from '../auth/workspace-resolver';
import { WriteRateLimiter } from '../http/write-rate-limiter';
import { EvidenceController, EVIDENCE_REPOSITORY, EVIDENCE_WRITE_LIMITER } from './evidence.controller';
import type { EvidenceRepository } from './evidence.repository';

/** Registered only with the database. The global AuthGuard (AuthModule) protects every route here. */
@Module({})
export class EvidenceModule {
  static register(repo: EvidenceRepository, workspaces: WorkspaceResolver, now: () => number = Date.now): DynamicModule {
    return {
      module: EvidenceModule,
      controllers: [EvidenceController],
      providers: [
        { provide: EVIDENCE_REPOSITORY, useValue: repo },
        { provide: EVIDENCE_WRITE_LIMITER, useValue: new WriteRateLimiter(now) },
        { provide: WORKSPACE_RESOLVER, useValue: workspaces },
        WorkspaceGuard,
      ],
    };
  }
}
