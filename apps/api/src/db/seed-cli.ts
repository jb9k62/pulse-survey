import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadConfig } from '../config.js';
import { grantDevSignIn, revokeDevSignIn } from './dev-grants.js';
import { runSeed } from './seed.js';

// `npm run db:seed`. Runs as the owner (DATABASE_URL_OWNER): the seed writes rows for two
// organisations, which pulse_app's policies would refuse, and the dev grants need the
// functions' owner.
//
// The seed writes demo users and responses, so it is for local development and test
// databases only, and it checks both things it can:
// - NODE_ENV must be development or test, read the same way as the API (unset counts as
//   production). The root `npm run db:seed` and `db:reset` set development; running the
//   workspace script directly with no NODE_ENV is refused.
// - The owner URL must point at this machine. A production database is never on
//   localhost, so this holds even when a shell exports NODE_ENV=development.
// AUTH_MODE decides the dev sign-in grants, so the database always matches the flag the
// API will start with. loadConfig already refuses AUTH_MODE=dev outside development.
const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

const config = loadConfig();
if (!config.isDevelopment) {
  throw new Error(
    'The seed writes demo data and runs only with NODE_ENV=development or NODE_ENV=test. ' +
      'Use the root `npm run db:seed`, which sets it.',
  );
}
const host = new URL(config.databaseUrlOwner).hostname;
if (!LOCAL_HOSTS.has(host)) {
  throw new Error(
    `The seed writes demo data and runs only against a local database, not "${host}".`,
  );
}

const pool = new Pool({ connectionString: config.databaseUrlOwner });
try {
  const db = drizzle(pool);
  await runSeed(db);
  console.log(
    'Seed complete: Acme Manufacturing and Blue River Health are present.',
  );
  if (config.devSignIn) {
    await grantDevSignIn(db);
    console.log('AUTH_MODE=dev: dev sign-in grants applied for pulse_app.');
  } else {
    await revokeDevSignIn(db);
    console.log(
      'AUTH_MODE=off: dev sign-in grants revoked. Set AUTH_MODE=dev and re-run to use the picker.',
    );
  }
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
