import { Controller, Delete, Get, HttpCode, Inject, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { SessionState } from '@pulse/contracts';
import { APP_CONFIG, type AppConfig } from '../config.js';
import type { TenantTx } from '../db/db.module.js';
import { CurrentTx, CurrentUser, OptionalUser, Public } from './decorators.js';
import {
  SESSION_COOKIE,
  SessionsService,
  type Principal,
} from './sessions.service.js';

/**
 * `GET /api/me` reports the session state for any caller, signed in or not.
 * `DELETE /api/sessions` logs out: it deletes the row on the request transaction, then
 * clears the cookie.
 */
@Controller()
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly adapterHost: HttpAdapterHost,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('me')
  @Public()
  me(@OptionalUser() principal: Principal | null): SessionState {
    return this.sessions.state(principal, this.config.devSignIn);
  }

  @Delete('sessions')
  @HttpCode(204)
  async logout(
    @CurrentUser() principal: Principal,
    @CurrentTx() tx: TenantTx,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<void> {
    await this.sessions.logout(principal, tx);
    this.adapterHost.httpAdapter.clearCookie(res, SESSION_COOKIE, {
      path: '/',
    });
  }
}
