import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { IDENTITY_DIRECTORY, IDENTITY_VERIFIER, SESSION_SERVICE } from "./auth.tokens";
import type { AuthDeps } from "./build-auth";

@Module({})
export class AuthModule {
  /** Registers the sign-in routes and the global deny-by-default guard. */
  static register(deps: AuthDeps): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        { provide: IDENTITY_VERIFIER, useValue: deps.verifier },
        { provide: IDENTITY_DIRECTORY, useValue: deps.directory },
        { provide: SESSION_SERVICE, useValue: deps.sessions },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
