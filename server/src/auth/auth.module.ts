import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { IDENTITY_DIRECTORY, IDENTITY_VERIFIER, LAB_MODE, LAB_PROJECT_ID, SESSION_SERVICE, SIGN_IN_LIMITER } from "./auth.tokens";
import type { AuthDeps } from "./build-auth";
import { LabController } from "./lab/lab.controller";

@Module({})
export class AuthModule {
  /** Registers the sign-in routes (plus the owner-lab page only when enabled) and the global deny-by-default guard. */
  static register(deps: AuthDeps): DynamicModule {
    const lab = deps.lab && deps.labProjectId !== null;
    return {
      module: AuthModule,
      controllers: lab ? [AuthController, LabController] : [AuthController],
      providers: [
        { provide: IDENTITY_VERIFIER, useValue: deps.verifier },
        { provide: IDENTITY_DIRECTORY, useValue: deps.directory },
        { provide: SESSION_SERVICE, useValue: deps.sessions },
        { provide: SIGN_IN_LIMITER, useValue: deps.limiter },
        { provide: LAB_PROJECT_ID, useValue: deps.labProjectId },
        { provide: LAB_MODE, useValue: deps.lab },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
