import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators.js';

@Controller()
export class AppController {
  // A readiness probe, not a liveness one: the tenant transaction interceptor opens a
  // database transaction for every request, so this answers 500 when PostgreSQL is down.
  @Get('health')
  @Public()
  health(): { status: string } {
    return { status: 'ok' };
  }
}
