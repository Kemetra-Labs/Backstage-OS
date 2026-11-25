import { Module, type DynamicModule } from '@nestjs/common';
import { WORKSPACE_RESOLVER, WorkspaceGuard } from '../auth/workspace.guard';
import type { WorkspaceResolver } from '../auth/workspace-resolver';
import { PortfolioController, PORTFOLIO_REPOSITORY } from './portfolio.controller';
import type { PortfolioRepository } from './portfolio.repository';

/** Registered only with the database. The global AuthGuard (AuthModule) protects every route here. */
@Module({})
export class PortfolioModule {
  static register(repo: PortfolioRepository, workspaces: WorkspaceResolver): DynamicModule {
    return {
      module: PortfolioModule,
      controllers: [PortfolioController],
      providers: [{ provide: PORTFOLIO_REPOSITORY, useValue: repo }, { provide: WORKSPACE_RESOLVER, useValue: workspaces }, WorkspaceGuard],
    };
  }
}
