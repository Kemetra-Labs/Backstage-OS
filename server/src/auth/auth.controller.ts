// Sign-in exchange, sign-out and the current principal (BACK-56).
// Every failure is a 404 with the fixed envelope: no reason, no claim, no token is echoed.
import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AUTH_DEPS, type AuthDeps, type AuthenticatedRequest } from './auth-deps';
import { clearedSessionCookie, readCookie, SESSION_COOKIE, sessionCookie } from './cookie';
import { IdentityTokenRejected } from './identity-provider.port';
import { AuthRefused, type Principal } from './principal-resolver';
import { OriginGuard, SessionGuard } from './session.guard';

interface HeaderSink {
  setHeader(name: string, value: string): void;
}

function tokenFrom(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const token = (body as { token?: unknown }).token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

@Controller()
export class AuthController {
  constructor(@Inject(AUTH_DEPS) private readonly deps: AuthDeps) {}

  @Post('auth/session')
  @UseGuards(OriginGuard)
  @HttpCode(204)
  async signIn(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) res: HeaderSink): Promise<void> {
    const raw = tokenFrom(body);
    if (!raw) throw new NotFoundException();
    let principal: Principal;
    try {
      principal = await this.deps.principals.signIn(await this.deps.verifier.verifyIdentityToken(raw));
    } catch (err) {
      if (err instanceof AuthRefused || err instanceof IdentityTokenRejected) throw new NotFoundException();
      throw err;
    }
    // Rotate: a session the browser already holds is revoked, so sessions never pile up and a
    // planted cookie cannot survive a fresh sign-in.
    const previous = readCookie(req.headers['cookie'], SESSION_COOKIE);
    const held = previous ? await this.deps.sessions.findActive(previous) : null;
    if (held) await this.deps.sessions.revoke(held.sessionId);
    const { token } = await this.deps.sessions.create(principal.userId);
    res.setHeader('Set-Cookie', sessionCookie(token));
  }

  @Post('auth/signout')
  @UseGuards(OriginGuard, SessionGuard)
  @HttpCode(204)
  async signOut(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: HeaderSink): Promise<void> {
    await this.deps.sessions.revoke(req.kawalys!.sessionId);
    res.setHeader('Set-Cookie', clearedSessionCookie());
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthenticatedRequest) {
    const { userId, workspaceId, role, capabilities } = req.kawalys!.principal;
    return { userId, workspaceId, role, capabilities };
  }
}
