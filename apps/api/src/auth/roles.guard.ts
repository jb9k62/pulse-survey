import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from './auth.guard.js';
import { Roles } from './decorators.js';

/** Runs after the auth guard, which is why it is the second `APP_GUARD` provider. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const principal = request.principal ?? null;
    if (principal === null) {
      // Defensive: the auth guard already answers 401 on a protected route.
      throw new UnauthorizedException();
    }

    if (!roles.includes(principal.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
