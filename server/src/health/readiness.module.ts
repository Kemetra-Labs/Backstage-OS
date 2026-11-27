import { Module, type DynamicModule } from "@nestjs/common";
import type { KawalysDatabase } from "../create-app";
import { READINESS_DATABASE, ReadinessController } from "./readiness.controller";

/** Always registered by createApp; with no database it answers 503. */
@Module({})
export class ReadinessModule {
  static register(database: KawalysDatabase | undefined): DynamicModule {
    return {
      module: ReadinessModule,
      controllers: [ReadinessController],
      providers: [{ provide: READINESS_DATABASE, useValue: database }],
    };
  }
}
