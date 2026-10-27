import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Pool } from 'pg';
import { AppModule, configureApp } from './app.module.js';
import {
  APP_CONFIG,
  assertDatabaseInvariants,
  type AppConfig,
} from './config.js';
import { DB_POOL } from './db/db.module.js';

async function bootstrap(): Promise<void> {
  let app: INestApplication | undefined;

  try {
    // The config factory runs inside `create`, so an invalid environment fails here.
    app = await NestFactory.create(AppModule);
    configureApp(app);
    const config = app.get<AppConfig>(APP_CONFIG);

    // Refuse to listen if the app role can bypass row-level security, or if the dev
    // sign-in grants disagree with AUTH_MODE.
    await assertDatabaseInvariants(app.get<Pool>(DB_POOL), {
      devSignIn: config.devSignIn,
    });

    await app.listen(config.apiPort);
  } catch (error) {
    Logger.error(
      error instanceof Error ? error.message : String(error),
      undefined,
      'Bootstrap',
    );
    if (app) {
      await app.close();
    }
    process.exit(1);
  }
}

await bootstrap();
