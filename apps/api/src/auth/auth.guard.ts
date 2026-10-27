import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';
import type { TenantTx } from '../db/db.module.js';
import { DevOnly, Public } from './decorators.js';
import {
  SESSION_COOKIE,
  SessionsService,
  type Principal,
} from './sessions.service.js';

/**
 * The request as the pipeline fills it: `principal` by AuthGuard, `tx` by
 * TenantTransactionInterceptor. Handlers read both through the decorators in
 * decorators.ts, never directly.
 */
export interface AuthedRequest extends Request {
  principal?: Principal | null;
  tx?: TenantTx;
}

/**
 * Read `pulse_session` from the `Cookie` header by hand. `cookie-parser` is not a
 * dependency and must not be added. A missing header means no database call.
 */
function readSessionToken(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  const prefix = `${SESSION_COOKIE}=`;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return null;
}

/**
 * Default-deny authentication, and the first step of the tenant context: the principal it
 * attaches is what the interceptor later writes into the `app.current_*` settings (see the
 * RLS overview at the top of src/db/schema.ts). Guards run before interceptors, so the 401
 * and the role check happen before the request transaction opens, and `resolve` needs its
 * own short transaction.
 *
 * `@Public()` only suppresses the 401: the guard still resolves a session when the cookie
 * is present, even on a public route, so `GET /api/me` can report a signed-in principal and
 * a revoked session is never a 401 on a public route.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride(Public, targets) === true;
    const devOnly = this.reflector.getAllAndOverride(DevOnly, targets) === true;

    // Guards run before pipes, so a 404 here beats a 400 for an invalid body on a
    // disabled dev route. Do not gate inside the handler body.
    if (devOnly && !this.config.devSignIn) {
      throw new NotFoundException();
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readSessionToken(request);
    const principal = token ? await this.sessions.resolve(token) : null;
    request.principal = principal;

    if (!isPublic && principal === null) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
