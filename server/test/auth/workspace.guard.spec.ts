import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequireCapability, WorkspaceGuard, type WorkspaceRequest } from '../../src/auth/workspace.guard';
import type { WorkspacePrincipal, WorkspaceResolver } from '../../src/auth/workspace-resolver';

const OWNER: WorkspacePrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  role: 'owner',
  capabilities: ['evidence.read', 'decision.create'],
};

class Routes {
  @RequireCapability('evidence.read') read() {}
  @RequireCapability('evidence.ingest') ingest() {}
  undeclared() {}
}

function context(handler: keyof Routes, req: WorkspaceRequest): ExecutionContext {
  return {
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const resolver = (p: WorkspacePrincipal | null) => ({ forUser: async () => p }) as unknown as WorkspaceResolver;
const guard = (p: WorkspacePrincipal | null) => new WorkspaceGuard(new Reflector(), resolver(p));
const req = (): WorkspaceRequest => ({ headers: {}, principal: { userId: OWNER.userId, role: 'owner' } }) as WorkspaceRequest;

describe('WorkspaceGuard (deny by default)', () => {
  it('passes a held capability and attaches the workspace', async () => {
    const r = req();
    await expect(guard(OWNER).canActivate(context('read', r))).resolves.toBe(true);
    expect(r.workspace).toEqual(OWNER);
  });

  it('refuses a capability the role does not hold', async () => {
    await expect(guard(OWNER).canActivate(context('ingest', req()))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a route that declares no capability', async () => {
    await expect(guard(OWNER).canActivate(context('undeclared', req()))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses without a principal or without a workspace', async () => {
    await expect(guard(OWNER).canActivate(context('read', { headers: {} } as WorkspaceRequest))).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard(null).canActivate(context('read', req()))).rejects.toBeInstanceOf(NotFoundException);
  });
});
