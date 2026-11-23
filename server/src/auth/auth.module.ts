import { Global, Module, type DynamicModule } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AUTH_DEPS, type AuthDeps } from './auth-deps';
import { CapabilityGuard } from './capability.guard';
import { OriginGuard, SessionGuard } from './session.guard';

/** Registered only when real mode is configured; there is no auth-less variant of these routes. */
@Global()
@Module({})
export class AuthModule {
  static register(deps: AuthDeps): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [{ provide: AUTH_DEPS, useValue: deps }, SessionGuard, OriginGuard, CapabilityGuard],
      exports: [AUTH_DEPS, SessionGuard, OriginGuard, CapabilityGuard],
    };
  }
}
