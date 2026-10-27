import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Res,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  devSessionRequestSchema,
  type DevSessionRequest,
  type DevUsersPayload,
  type SessionState,
} from '@pulse/contracts';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { CurrentTx, DevOnly, Public } from '../auth/decorators.js';
import {
  SESSION_COOKIE,
  SessionsService,
  hashToken,
  sessionCookieOptions,
} from '../auth/sessions.service.js';
import type { TenantTx } from '../db/db.module.js';
import { DevService } from './dev.service.js';

/**
 * The development sign-in picker (ADR-0002). `@DevOnly()` makes every route a 404 unless
 * `AUTH_MODE=dev`, and the guard decides that before validation runs. `@Public()` because
 * the caller has no session yet. The cross-tenant reads happen in DevService.
 */
@Controller('dev')
@Public()
@DevOnly()
export class DevController {
  constructor(
    private readonly dev: DevService,
    private readonly sessions: SessionsService,
    private readonly adapterHost: HttpAdapterHost,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('users')
  async listUsers(@CurrentTx() tx: TenantTx): Promise<DevUsersPayload> {
    return { users: await this.dev.listUsers(tx) };
  }

  @Post('sessions')
  @HttpCode(201)
  async createSession(
    @Body({ schema: devSessionRequestSchema }) body: DevSessionRequest,
    @CurrentTx() tx: TenantTx,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<SessionState> {
    const { token, user } = await this.dev.createSession(tx, body.userId);

    this.adapterHost.httpAdapter.setCookie(
      res,
      SESSION_COOKIE,
      token,
      sessionCookieOptions(this.config),
    );

    return this.sessions.state(
      {
        userId: user.id,
        name: user.name,
        role: user.role,
        organisation: user.organisation,
        tokenHash: hashToken(token),
      },
      true,
    );
  }
}
