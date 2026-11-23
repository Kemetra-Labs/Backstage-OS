import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "kawalys:is-public";

/**
 * Opts a route out of authentication. Every route is protected by default (AuthGuard is global), so a new
 * controller with no decorator is denied. Only liveness and the sign-in exchange use this.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
