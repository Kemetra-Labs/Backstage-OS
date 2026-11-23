import "reflect-metadata";
import { Module, type INestApplication, type Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AuthModule } from "./auth/auth.module";
import { buildAuth, type AuthOverrides } from "./auth/build-auth";
import { SafeErrorFilter } from "./http/safe-error.filter";
import { requestIdMiddleware } from "./http/request-id";

export async function createApp(
  extraControllers: Type<unknown>[] = [],
  authOverrides: AuthOverrides = {},
): Promise<INestApplication> {
  // Throws (AuthConfigError) before anything listens if the auth configuration is malformed, or incomplete in production.
  const auth = buildAuth(process.env, authOverrides);

  @Module({ imports: [AppModule, AuthModule.register(auth)], controllers: extraControllers })
  class RootModule {}

  // Error-only logger: the filter never logs exception messages.
  const app = await NestFactory.create(RootModule, { logger: ["error"] });
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new SafeErrorFilter());
  await app.init();
  return app;
}
