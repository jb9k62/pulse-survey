import {
  createParamDecorator,
  InternalServerErrorException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Organisation, Role } from '@pulse/contracts';
import type { TenantTx } from '../db/db.module.js';
import type { AuthedRequest } from './auth.guard.js';
import type { Principal } from './sessions.service.js';

// `Reflector.createDecorator` is the current way to write a metadata decorator. The
// transform lets `@Public()` and `@DevOnly()` take no argument and still store `true`.

/** Suppresses the auth guard's 401. The guard still resolves a session if there is one. */
export const Public = Reflector.createDecorator<void, boolean>({
  transform: () => true,
});

/** A 404 unless `AUTH_MODE=dev`. */
export const DevOnly = Reflector.createDecorator<void, boolean>({
  transform: () => true,
});

/** The roles allowed on a route, checked by RolesGuard. No decorator means any role. */
export const Roles = Reflector.createDecorator<Role[]>();

// Every decorator reads the principal the auth guard attached to the request. None of
// them read a body, a query string or a route parameter.

function principalOf(context: ExecutionContext): Principal | null {
  const request = context.switchToHttp().getRequest<AuthedRequest>();
  return request.principal ?? null;
}

/**
 * The authenticated principal. A protected route never sees a missing one, because the
 * guard has already answered 401; the throw is the same rule, stated where it is read.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = principalOf(context);
    if (principal === null) {
      throw new UnauthorizedException();
    }
    return principal;
  },
);

/**
 * The principal, or `null` with no valid session. Only for a `@Public()` route that
 * reports the session state (`GET /api/me`).
 */
export const OptionalUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal | null =>
    principalOf(context),
);

/**
 * The caller's organisation. It comes from the session only, the same value the
 * interceptor wrote into `app.current_org`, so the repository's organisation filter and the
 * RLS policies always agree.
 */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Organisation => {
    const principal = principalOf(context);
    if (principal === null) {
      throw new UnauthorizedException();
    }
    return principal.organisation;
  },
);

/**
 * The request's tenant transaction, opened by TenantTransactionInterceptor with the
 * `app.current_*` settings already set. Every repository call must use it, because the RLS
 * policies see the tenant only on this transaction (see the RLS overview at the top of
 * src/db/schema.ts).
 */
export const CurrentTx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantTx => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (request.tx === undefined) {
      throw new InternalServerErrorException(
        'No tenant transaction on the request',
      );
    }
    return request.tx;
  },
);
