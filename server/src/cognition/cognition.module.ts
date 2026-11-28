import { Module, type DynamicModule } from '@nestjs/common';
import { WORKSPACE_RESOLVER, WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceResolver } from '../auth/workspace-resolver';
import { SignInRateLimiter } from '../auth/sign-in-rate-limiter';
import type { MemoryRepository } from '../memory/memory.repository';
import { COGNITION_LIMITER, COGNITION_MEMORY, COGNITION_READS_PER_MINUTE, COGNITION_SLOTS, CognitionController } from './cognition.controller';
import { COGNITION_READS_IN_FLIGHT, ReadSlots } from './read-slots';

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
        { provide: COGNITION_SLOTS, useValue: new ReadSlots(COGNITION_READS_IN_FLIGHT) },
        { provide: WORKSPACE_RESOLVER, useValue: workspaces },
        WorkspaceGuard,
      ],
    };
  }
}
