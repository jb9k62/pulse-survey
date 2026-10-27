import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

/**
 * Sessions: `GET /api/me`, `DELETE /api/sessions` and the service that resolves a cookie.
 * The two guards are registered as `APP_GUARD` providers in `AppModule` (contract section
 * 2.1), because a guard provided there runs for every module. `Reflector` is global.
 */
@Module({
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class AuthModule {}
