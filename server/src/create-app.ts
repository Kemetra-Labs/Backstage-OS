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
import { SafeErrorFilter } from "./http/safe-error.filter";
import { requestIdMiddleware } from "./http/request-id";

/** The two checked database logins (BACK-55). Without them: in-memory sessions and no evidence routes. */
export interface KawalysDatabase {
  readonly appPool: pg.Pool;
  readonly authPool: pg.Pool;
}

export interface CreateAppOptions {
  readonly database?: KawalysDatabase;
}

export async function createApp(
  extraControllers: Type<unknown>[] = [],
  authOverrides: AuthOverrides = {},
  options: CreateAppOptions = {},
): Promise<INestApplication> {
  const db = options.database;
  const workspaces = db ? new WorkspaceResolver(db.appPool, db.authPool) : undefined;
  const persistence: AuthPersistence | undefined =
    db && workspaces
      ? { store: new PostgresSessionStore(db.authPool), directoryFor: (owner) => new DatabaseOwnerDirectory(owner, db.authPool, workspaces) }
      : undefined;
  // Throws (AuthConfigError) before anything listens if the auth configuration is malformed, or incomplete in production.
  const auth = buildAuth(process.env, authOverrides, persistence);

  const imports: (Type<unknown> | DynamicModule)[] = [AppModule, AuthModule.register(auth)];
  // Evidence routes exist only with the database; the global AuthGuard protects them like every route.
  if (db && workspaces) imports.push(EvidenceModule.register(new EvidenceRepository(db.appPool), workspaces));

  @Module({ imports, controllers: extraControllers })
  class RootModule {}

  // Error-only logger: the filter never logs exception messages. JSON bodies only: Nest's default also
  // parses urlencoded forms, and a plain HTML form on another localhost port (same site, so the SameSite
  // cookie is sent) could then post to a state-changing route. A form body now never parses (400).
  const app = await NestFactory.create<NestExpressApplication>(RootModule, { logger: ["error"], bodyParser: false });
  app.useBodyParser("json");
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new SafeErrorFilter());
  await app.init();
  return app;
}
