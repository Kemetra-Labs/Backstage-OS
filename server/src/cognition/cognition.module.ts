import { Module, type DynamicModule } from '@nestjs/common';
import { WORKSPACE_RESOLVER, WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceResolver } from '../auth/workspace-resolver';
import { SignInRateLimiter } from '../auth/sign-in-rate-limiter';
import type { MemoryRepository } from '../memory/memory.repository';
import { COGNITION_LIMITER, COGNITION_MEMORY, COGNITION_READS_PER_MINUTE, CognitionController } from './cognition.controller';

/** Registered only with the database. The global AuthGuard (AuthModule) protects every route here. */
@Module({})
export class CognitionModule {
  static register(memory: MemoryRepository, workspaces: WorkspaceResolver, now: () => number = Date.now): DynamicModule {
    return {
      module: CognitionModule,
      controllers: [CognitionController],
      providers: [
        { provide: COGNITION_MEMORY, useValue: memory },
        { provide: COGNITION_LIMITER, useValue: new SignInRateLimiter(now, COGNITION_READS_PER_MINUTE) },
        { provide: WORKSPACE_RESOLVER, useValue: workspaces },
        WorkspaceGuard,
      ],
    };
  }
}
