import { Controller, Delete, Get, Headers, HttpCode, HttpException, Inject, Logger, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { RequestWithId, ResponseLike } from "../http/request-id";
import type { AuthedRequest } from "./auth.guard";
import { IDENTITY_DIRECTORY, IDENTITY_VERIFIER, LAB_MODE, SESSION_SERVICE, SIGN_IN_LIMITER } from "./auth.tokens";
import type { IdentityDirectory } from "./identity/identity-directory";
import type { IdentityVerificationPort, RefusalReason } from "./identity/identity-verification.port";
import { Public } from "./public.decorator";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./session/session-cookie";
import type { SessionService } from "./session/session.service";
import type { SignInRateLimiter } from "./sign-in-rate-limiter";

const VERIFY_TIMEOUT_MS = 10_000;
const TOO_MANY_REQUESTS = 429;
const BEARER_RE = /^Bearer ([A-Za-z0-9_.-]{1,8192})$/;

interface RemoteRequest {
  socket?: { remoteAddress?: string };
}

interface CookieResponse extends ResponseLike {
  setHeader(name: string, value: string): unknown;
}

function bearerFrom(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  return BEARER_RE.exec(header)?.[1] ?? null;
}

/** The fixed refusal line: the code and, when jose named one, the claim's name. Never a value. */
function refusalLine(reason: RefusalReason): string {
  return `identity token refused: ${reason.code}${reason.claim === undefined ? "" : ` claim=${reason.claim}`}`;
}

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger("Auth");

  constructor(
    @Inject(IDENTITY_VERIFIER) private readonly verifier: IdentityVerificationPort,
    @Inject(IDENTITY_DIRECTORY) private readonly directory: IdentityDirectory,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(SIGN_IN_LIMITER) private readonly limiter: SignInRateLimiter,
    @Inject(LAB_MODE) private readonly lab: boolean,
  ) {}

  /**
   * The only place a provider JWT is accepted. Verifies it, resolves the subject to the local owner, issues a
   * Kawalys session cookie. Every non-success is the same UnauthorizedException (see AuthGuard); only the
   * operator-facing fixed log line differs, and it never includes the token or claims. The one visible
   * exception is the rate limit (429), which is checked first so a flood never reaches the verifier.
   */
  @Public()
  @Post("session")
  @HttpCode(200)
  async exchange(
    @Headers("authorization") authorization: string | string[] | undefined,
    @Req() req: RemoteRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    res.setHeader("cache-control", "no-store");
    // Behind a loopback BFF every caller shares one address, so this is effectively a global limit (intended).
    if (!this.limiter.tryAcquire(req.socket?.remoteAddress ?? "unknown")) throw new HttpException("", TOO_MANY_REQUESTS);
    const jwt = bearerFrom(authorization);
    if (jwt === null) throw new UnauthorizedException();

    const result = await this.verifier.verify(jwt, AbortSignal.timeout(VERIFY_TIMEOUT_MS));
    if (result.kind === "unavailable") this.logger.error("identity provider unavailable");
    if (result.kind === "unconfigured") this.logger.error("identity provider not configured");
    // Why a token was refused is shown only in the lab (the owner's own machine). In normal operation a refusal
    // stays silent, since it is attack noise. The client never sees it either way. It is logged with error()
    // because createApp runs Nest with logger ['error']: a warn() line would be filtered out and never print.
    if (result.kind === "refused" && this.lab && result.reason !== undefined) this.logger.error(refusalLine(result.reason));
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
