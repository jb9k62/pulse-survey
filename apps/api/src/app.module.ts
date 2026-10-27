import {
  Module,
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { TenantTransactionInterceptor } from './common/tenant-transaction.interceptor.js';
import { ConfigModule } from './config.module.js';
import { DbModule } from './db/db.module.js';
import { DevModule } from './dev/dev.module.js';
import { SurveysModule } from './surveys/surveys.module.js';

/**
 * The one place the `api` prefix is set. `main.ts` and the e2e helper both call it, so the
 * prefix cannot drift. The pipeline lives in `AppModule`, never in `main.ts`, so the e2e
 * suite runs the same guards, pipe and filter as the server.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
}

@Module({
  imports: [ConfigModule, DbModule, AuthModule, DevModule, SurveysModule],
  controllers: [AppController],
  providers: [
    // Order in the array is the run order: auth first, then roles.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // One tenant transaction per request, after the guards (see the RLS overview at the
    // top of src/db/schema.ts).
    { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
    { provide: APP_PIPE, useFactory: () => new StandardSchemaValidationPipe() },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
