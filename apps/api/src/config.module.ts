import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig, type AppConfig } from './config.js';

/**
 * The validated environment as one global provider. `loadConfig` reads the repo-root
 * `.env` itself, and this factory is the only place the running app calls it, so
 * `main.ts` reads the config back with `app.get(APP_CONFIG)` instead of parsing twice.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig() },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
