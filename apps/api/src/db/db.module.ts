import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import {
  drizzle,
  type NodePgDatabase,
  type NodePgTransaction,
} from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config.js';
import * as schema from './schema.js';

export const DB_POOL = Symbol('DB_POOL');
export const DB = Symbol('DB');

export type Db = NodePgDatabase<typeof schema>;
/**
 * The request transaction handle. Repository methods take this type, never `Db`, so a
 * query cannot silently run outside the tenant settings the interceptor set.
 */
export type TenantTx = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * One global infrastructure module owns the app-role pool and the Drizzle instance, so
 * guards, the interceptor and the feature modules can inject the tokens without importing
 * anything. The config comes from the global `ConfigModule`.
 *
 * The pool connects as pulse_app (`DATABASE_URL_APP`), never as the owner, so every query
 * the API makes is subject to RLS (see the RLS overview at the top of src/db/schema.ts).
 */
@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      useFactory: (config: AppConfig): Pool =>
        new Pool({ connectionString: config.databaseUrlApp }),
      inject: [APP_CONFIG],
    },
    {
      provide: DB,
      useFactory: (pool: Pool): Db => drizzle(pool, { schema }),
      inject: [DB_POOL],
    },
  ],
  exports: [DB_POOL, DB],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
