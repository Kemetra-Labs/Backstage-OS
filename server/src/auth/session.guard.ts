// Resolves the session cookie to a principal; anything else is a 404 (policy M05-D05-B).
// The demo persona header is ignored here: it is never authentication.
import { Inject, Injectable, NotFoundException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { AUTH_DEPS, type AuthDeps, type AuthenticatedRequest } from './auth-deps';
import { readCookie, SESSION_COOKIE } from './cookie';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH_DEPS) private readonly deps: AuthDeps) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(req.headers['cookie'], SESSION_COOKIE);
    if (!token) throw new NotFoundException();
    const session = await this.deps.sessions.findActive(token);
    if (!session) throw new NotFoundException();
    const principal = await this.deps.principals.forUser(session.userId);
    if (!principal) throw new NotFoundException();
    req.kawalys = { principal, sessionId: session.sessionId };
    return true;
  }
}

/** State-changing routes: the Origin header must equal the configured origin exactly. */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(AUTH_DEPS) private readonly deps: AuthDeps) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<AuthenticatedRequest>().headers['origin'];
    if (typeof origin !== 'string' || origin !== this.deps.allowedOrigin) throw new NotFoundException();
    return true;
  }
}
