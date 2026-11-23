import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RequestWithId, ResponseLike } from "../http/request-id";
import { IDENTITY_DIRECTORY, SESSION_SERVICE } from "./auth.tokens";
import type { IdentityDirectory, Role } from "./identity/identity-directory";
import { IS_PUBLIC } from "./public.decorator";
import { readSessionToken } from "./session/session-cookie";
import type { SessionService } from "./session/session.service";

export interface Principal {
  readonly userId: string;
  readonly role: Role;
}

export interface AuthedRequest extends RequestWithId {
  principal?: Principal;
}

/**
 * Global deny-by-default guard. A request passes only with a live Kawalys session whose verified provider
 * triple still resolves to an enabled local user. Every failure is the same UnauthorizedException; the
 * SafeErrorFilter turns it into the standard not_found envelope (policy M05-D05-B), so a caller cannot tell
 * "no session" from "expired", "revoked" or "no longer the owner".
 *
 * It reads only the session cookie. It never reads x-kawalys-demo-persona (a display switch, not authorization)
 * and never accepts a provider JWT; that is exchanged once at POST /auth/session.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(IDENTITY_DIRECTORY) private readonly directory: IdentityDirectory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    http.getResponse<ResponseLike>().setHeader("cache-control", "no-store");

    const token = readSessionToken(req.headers["cookie"]);
    if (token === null) throw new UnauthorizedException();
    const session = await this.sessions.authenticate(token);
    if (session === null) throw new UnauthorizedException();

    // Recheck against the current directory on every request: if the owner configuration changed, or the
    // user is gone or disabled, the old session dies here.
    const user = await this.directory.resolve(session.subject);
    if (user === null || user.userId !== session.userId) {
      await this.sessions.revoke(token);
      throw new UnauthorizedException();
    }
    req.principal = { userId: user.userId, role: user.role };
    return true;
  }
}
