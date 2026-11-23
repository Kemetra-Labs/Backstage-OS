// Route-level capability check, AFTER the global AuthGuard (#76) has set req.principal. Deny by default:
// a route behind this guard that declares no capability is refused. Every refusal is a 404 (policy
// M05-D05-B), like an absent record. Personas are display only and never read here.
import { Inject, Injectable, NotFoundException, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from './auth.guard';
import type { Capability } from './capabilities';
import type { WorkspacePrincipal, WorkspaceResolver } from './workspace-resolver';

export const WORKSPACE_RESOLVER = Symbol('kawalys:workspace-resolver');
const CAPABILITY_KEY = 'kawalys:capability';

export const RequireCapability = (capability: Capability) => SetMetadata(CAPABILITY_KEY, capability);

export interface WorkspaceRequest extends AuthedRequest {
  workspace?: WorkspacePrincipal;
}

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(WORKSPACE_RESOLVER) private readonly resolver: WorkspaceResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Capability | undefined>(CAPABILITY_KEY, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<WorkspaceRequest>();
    if (!required || !req.principal) throw new NotFoundException();
    const workspace = await this.resolver.forUser(req.principal.userId);
    if (!workspace || !workspace.capabilities.includes(required)) throw new NotFoundException();
    req.workspace = workspace;
    return true;
  }
}
