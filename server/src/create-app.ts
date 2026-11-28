import "reflect-metadata";
import { Module, type DynamicModule, type INestApplication, type Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type pg from "pg";
import { AppModule } from "./app.module";
import { AuthModule } from "./auth/auth.module";
import { buildAuth, type AuthOverrides, type AuthPersistence } from "./auth/build-auth";
import { DatabaseOwnerDirectory } from "./auth/identity/database-owner-directory";
import { PostgresSessionStore } from "./auth/session/postgres-session-store";
import { WorkspaceResolver } from "./auth/workspace-resolver";
import { EvidenceModule } from "./evidence/evidence.module";
import { EvidenceRepository } from "./evidence/evidence.repository";
import { configuredApprovalPolicy } from "./evidence/source-approval";
import { DemoModule } from "./demo/demo.module";
import { allowedHosts } from "./config/allowed-hosts";
import { allowedOrigins } from "./config/allowed-origins";
import { hostCheck } from "./http/host-check";
import { trustProxy } from "./config/trust-proxy";
import { ReadinessModule } from "./health/readiness.module";
import { InvestigationModule } from "./investigations/investigation.module";
import { InvestigationRepository } from "./investigations/investigation.repository";
import { CognitionModule } from "./cognition/cognition.module";
import { MemoryRepository } from "./memory/memory.repository";
import { PortfolioModule } from "./portfolio/portfolio.module";
import { PortfolioRepository } from "./portfolio/portfolio.repository";
import { SafeErrorFilter } from "./http/safe-error.filter";
import { originCheck } from "./http/origin-check";
import { requestIdMiddleware } from "./http/request-id";

/** The two checked database logins (BACK-55). Without them: in-memory sessions and no evidence routes. */
export interface KawalysDatabase {
  readonly appPool: pg.Pool;
  readonly authPool: pg.Pool;
}

export interface CreateAppOptions {
  readonly database?: KawalysDatabase;
  /** Clock of the evidence write limiter (BACK-172 G2). Tests inject one; the default is Date.now. */
  readonly writeClock?: () => number;
}

export async function createApp(
  extraControllers: Type<unknown>[] = [],
  authOverrides: AuthOverrides = {},
  options: CreateAppOptions = {},
): Promise<INestApplication> {
  // Fail-closed and checked first, with or without a database: a malformed KAWALYS_APPROVED_SOURCES stops startup (BACK-131).
  const approval = configuredApprovalPolicy(process.env);
  const db = options.database;
  const workspaces = db ? new WorkspaceResolver(db.appPool, db.authPool) : undefined;
  const persistence: AuthPersistence | undefined =
    db && workspaces
      ? { store: new PostgresSessionStore(db.authPool), directoryFor: (owner) => new DatabaseOwnerDirectory(owner, db.authPool, workspaces) }
      : undefined;
  // Throws (AuthConfigError) before anything listens if the auth configuration is malformed, or incomplete in production.
  const auth = buildAuth(process.env, authOverrides, persistence);

  const imports: (Type<unknown> | DynamicModule)[] = [AppModule, AuthModule.register(auth), ReadinessModule.register(db)];
  // Evidence routes exist only with the database; the global AuthGuard protects them like every route.
  if (db && workspaces) {
    const evidence = new EvidenceRepository(db.appPool, approval);
    imports.push(EvidenceModule.register(evidence, workspaces, options.writeClock));
    imports.push(InvestigationModule.register(new InvestigationRepository(db.appPool), evidence, workspaces));
    imports.push(PortfolioModule.register(new PortfolioRepository(db.appPool), workspaces));
    // COG-07 live search (owner decision 2026-11-27): read-only, rate limited per user.
    imports.push(CognitionModule.register(new MemoryRepository(db.appPool), workspaces));
  } else {
    // The fixture demo route (it reads the display persona header) exists only without a database (audit L3).
    imports.push(DemoModule);
  }

  @Module({ imports, controllers: extraControllers })
  class RootModule {}

  // Error-only logger: the filter never logs exception messages. JSON bodies only: Nest's default also
  // parses urlencoded forms, and a plain HTML form on another localhost port (same site, so the SameSite
  // cookie is sent) could then post to a state-changing route. A form body now never parses (400).
  // Validate before the app exists: a malformed KAWALYS_TRUST_PROXY must never leave a created app behind (BACK-64).
  const trusted = trustProxy(process.env);
  // Same rule for KAWALYS_ALLOWED_ORIGINS (audit M1): a malformed value stops startup before the app exists.
  const origins = allowedOrigins(process.env);
  // Host allowlist (BACK-172 G5): required in production (after the auth check above), off when unset elsewhere.
  const hosts = allowedHosts(process.env);
  const app = await NestFactory.create<NestExpressApplication>(RootModule, { logger: ["error"], bodyParser: false });
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  // Behind the pilot proxy: trust X-Forwarded-For only from the listed proxy addresses (BACK-64). Unset: ignored.
  if (trusted !== null) app.getHttpAdapter().getInstance().set("trust proxy", [...trusted]);
  app.use(requestIdMiddleware);
  // An unlisted Host gets the uniform 404 before the Origin check or any parsing (BACK-172 G5).
  if (hosts !== null) app.use(hostCheck(hosts));
  // State-changing requests must be same-origin or from an allowlisted Origin (audit M1); registered before any route.
  app.use(originCheck({ allowed: origins, production: process.env.NODE_ENV === "production" }));
  // After the origin check, so a refused request is never parsed.
  // Explicit 32 kB cap (BACK-172 G2; the largest valid decision is about 12 kB). An oversize body is refused here,
  // before any route handler, as the uniform 400 validation_error with no-store (SafeErrorFilter).
  app.useBodyParser("json", { limit: "32kb" });
  app.useGlobalFilters(new SafeErrorFilter());
  await app.init();
  return app;
}
