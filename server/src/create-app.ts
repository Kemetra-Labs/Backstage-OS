import "reflect-metadata";
import { Module, type DynamicModule, type INestApplication, type Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import type { AuthDeps } from "./auth/auth-deps";
import { AuthModule } from "./auth/auth.module";
import type { EvidenceRepository } from "./evidence/evidence.repository";
import { EvidenceModule } from "./evidence/evidence.module";
import { SafeErrorFilter } from "./http/safe-error.filter";
import { requestIdMiddleware } from "./http/request-id";

export interface CreateAppOptions {
  /** Real mode (BACK-56). Without it only the synthetic routes exist. */
  readonly auth?: AuthDeps;
  /** Evidence API (BACK-55 S3). Requires `auth`: there is no unauthenticated evidence route. */
  readonly evidence?: EvidenceRepository;
}

export async function createApp(extraControllers: Type<unknown>[] = [], options: CreateAppOptions = {}): Promise<INestApplication> {
  if (options.evidence && !options.auth) throw new Error("createApp: evidence routes require auth");
  const imports: (Type<unknown> | DynamicModule)[] = [AppModule];
  if (options.auth) imports.push(AuthModule.register(options.auth));
  if (options.evidence) imports.push(EvidenceModule.register(options.evidence));

  @Module({ imports, controllers: extraControllers })
  class RootModule {}

  // Error-only logger: the filter never logs exception messages.
  const app = await NestFactory.create(RootModule, { logger: ["error"] });
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new SafeErrorFilter());
  await app.init();
  return app;
}
