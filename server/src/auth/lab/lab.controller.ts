import { randomBytes } from "node:crypto";
import { Controller, Get, Inject, Res } from "@nestjs/common";
import { LAB_PROJECT_ID } from "../auth.tokens";
import { Public } from "../public.decorator";
import { labContentSecurityPolicy, renderSignInPage } from "./sign-in-page";

interface HtmlResponse {
  setHeader(name: string, value: string): unknown;
}

/**
 * The owner-lab sign-in page. Registered only when KAWALYS_AUTH_LAB=1 and the Descope project is configured
 * (AuthModule), and never in production (loadAuthConfig refuses that combination), so otherwise the route is a
 * plain 404.
 */
@Controller("auth")
export class LabController {
  constructor(@Inject(LAB_PROJECT_ID) private readonly projectId: string) {}

  @Public()
  @Get("lab")
  page(@Res({ passthrough: true }) res: HtmlResponse): string {
    const nonce = randomBytes(16).toString("base64url");
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-security-policy", labContentSecurityPolicy(nonce));
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "no-referrer");
    return renderSignInPage(this.projectId, nonce);
  }
}
