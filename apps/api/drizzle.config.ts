import { defineConfig } from 'drizzle-kit';
import { loadRootEnv, requireEnv } from './src/db/load-env.js';

// drizzle-kit loads dotenv/config, which reads .env from its cwd (apps/api under
// a workspace script). The repo keeps one .env at the root, so load it with the
// same loader the seed and the API use.
loadRootEnv();
const url = requireEnv('DATABASE_URL_OWNER');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './db/migrations',
  casing: 'snake_case',
  dbCredentials: { url },
});
