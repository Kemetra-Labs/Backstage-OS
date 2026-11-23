import { Controller, Delete, Get, Headers, HttpCode, Inject, Logger, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { RequestWithId, ResponseLike } from "../http/request-id";
import type { AuthedRequest } from "./auth.guard";
import { IDENTITY_DIRECTORY, IDENTITY_VERIFIER, SESSION_SERVICE } from "./auth.tokens";
import type { IdentityDirectory } from "./identity/identity-directory";
import type { IdentityVerificationPort } from "./identity/identity-verification.port";
import { Public } from "./public.decorator";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./session/session-cookie";
import type { SessionService } from "./session/session.service";

const VERIFY_TIMEOUT_MS = 10_000;
const BEARER_RE = /^Bearer ([A-Za-z0-9_.-]{1,8192})$/;

interface CookieResponse extends ResponseLike {
  setHeader(name: string, value: string): unknown;
}

function bearerFrom(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  return BEARER_RE.exec(header)?.[1] ?? null;
}

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger("Auth");

  constructor(
    @Inject(IDENTITY_VERIFIER) private readonly verifier: IdentityVerificationPort,
    @Inject(IDENTITY_DIRECTORY) private readonly directory: IdentityDirectory,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
  ) {}

  /**
   * The only place a provider JWT is accepted. Verifies it, resolves the subject to the local owner, issues a
   * Kawalys session cookie. Every non-success is the same UnauthorizedException (see AuthGuard); only the
   * operator-facing fixed log line differs, and it never includes the token or claims.
   */
  @Public()
  @Post("session")
  @HttpCode(200)
  async exchange(
    @Headers("authorization") authorization: string | string[] | undefined,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    res.setHeader("cache-control", "no-store");
    const jwt = bearerFrom(authorization);
    if (jwt === null) throw new UnauthorizedException();

    const result = await this.verifier.verify(jwt, AbortSignal.timeout(VERIFY_TIMEOUT_MS));
    if (result.kind === "unavailable") this.logger.error("identity provider unavailable");
    if (result.kind === "unconfigured") this.logger.error("identity provider not configured");
    if (result.kind !== "verified") throw new UnauthorizedException();

    const user = await this.directory.resolve(result.subject);
    if (user === null) throw new UnauthorizedException();

    const session = await this.sessions.issue(user, result.subject);
    res.setHeader("set-cookie", setSessionCookie(session.rawToken, session.maxAgeSeconds));
    return { user: { id: user.userId, role: user.role }, expires_at: new Date(session.expiresAt).toISOString() };
  }

  @Get("me")
  me(@Req() req: AuthedRequest) {
    const principal = req.principal;
    if (principal === undefined) throw new UnauthorizedException();
    return { user: { id: principal.userId, role: principal.role } };
  }

  /** Revokes the current session. */
  @Delete("session")
  @HttpCode(204)
  async signOut(@Req() req: RequestWithId, @Res({ passthrough: true }) res: CookieResponse): Promise<void> {
    const token = readSessionToken(req.headers["cookie"]);
    if (token !== null) await this.sessions.revoke(token);
    res.setHeader("set-cookie", clearSessionCookie());
  }

  /** Revokes every session of the signed-in user. */
  @Delete("sessions")
  @HttpCode(204)
  async signOutEverywhere(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: CookieResponse): Promise<void> {
    if (req.principal === undefined) throw new UnauthorizedException();
    await this.sessions.revokeAllForUser(req.principal.userId);
    res.setHeader("set-cookie", clearSessionCookie());
  }
}
