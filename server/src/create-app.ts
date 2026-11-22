import "reflect-metadata";
import { Module, type INestApplication, type Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { SafeErrorFilter } from "./http/safe-error.filter";
import { requestIdMiddleware } from "./http/request-id";

export async function createApp(extraControllers: Type<unknown>[] = []): Promise<INestApplication> {
  @Module({ imports: [AppModule], controllers: extraControllers })
  class RootModule {}

  // Error-only logger: the filter never logs exception messages.
  const app = await NestFactory.create(RootModule, { logger: ["error"] });
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new SafeErrorFilter());
  await app.init();
  return app;
}
