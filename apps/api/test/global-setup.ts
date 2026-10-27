import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { TestProject } from 'vitest/node';
import { Client, Pool } from 'pg';
import { loadRootEnv, requireEnv } from '../src/db/load-env.js';
import { grantDevSignIn } from '../src/db/dev-grants.js';
import { runSeed } from '../src/db/seed.js';

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../db/migrations', import.meta.url),
);

// Never reset anything but a database whose name ends with _test. A misconfigured
// .env must not drop the development database's schemas.
function assertTestDatabase(connectionString: string): void {
  const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to reset the database "${databaseName}": its name must end with _test.`,
    );
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    // Whether pulse_app could call any dev function straight after the migrations, before
    // the dev-only grant. Must be false: migrations also run in production.
    devGrantsAfterMigrate: boolean;
  }
}

export default async function globalSetup(project: TestProject): Promise<void> {
  loadRootEnv();
  const ownerUrl = requireEnv('TEST_DATABASE_URL_OWNER');
  assertTestDatabase(ownerUrl);
  // The suites connect as pulse_app through this URL, and the dev grants below are applied
  // to whatever database it names, so it must be a test database as well.
  assertTestDatabase(requireEnv('TEST_DATABASE_URL_APP'));

  // Drop and recreate the schemas, then migrate and seed. Dropping `drizzle`
  // matters: without it the second run's migrate() is a no-op against an empty
  // database. `public` is recreated owned by pulse_owner so migrations still run
  // as the schema owner.
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public, dev, drizzle CASCADE');
    await client.query('CREATE SCHEMA public AUTHORIZATION pulse_owner');
  } finally {
    await client.end();
  }

  const pool = new Pool({ connectionString: ownerUrl });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const probe = await pool.query<{ granted: boolean }>(
      `select has_schema_privilege('pulse_app', 'dev', 'USAGE')
           or has_function_privilege('pulse_app', 'dev.list_users()', 'EXECUTE')
           or has_function_privilege('pulse_app', 'dev.create_session(uuid, text, timestamptz)', 'EXECUTE')
         as granted`,
    );
    project.provide('devGrantsAfterMigrate', probe.rows[0]?.granted ?? true);
    await runSeed(db);
    await grantDevSignIn(db);
  } finally {
    await pool.end();
  }
}
