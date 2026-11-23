// Deny-by-default capability check. Use after SessionGuard. A route behind this guard that
// declares no capability is refused. Refusal is a 404, like an absent record.
import { Injectable, NotFoundException, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth-deps';
import type { Capability } from './capabilities';

const CAPABILITY_KEY = 'kawalys:capability';

export const RequireCapability = (capability: Capability) => SetMetadata(CAPABILITY_KEY, capability);

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Capability | undefined>(CAPABILITY_KEY, [context.getHandler(), context.getClass()]);
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().kawalys?.principal;
    if (!required || !principal || !principal.capabilities.includes(required)) throw new NotFoundException();
    return true;
  }
}
