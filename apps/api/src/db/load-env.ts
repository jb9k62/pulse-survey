import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT_ENV = fileURLToPath(new URL('../../../../.env', import.meta.url));

/**
 * Load the repo-root `.env`. drizzle-kit's own dotenv loads `.env` from the cwd
 * (`apps/api` under a workspace script), and the seed CLI and tests need the same
 * variables, so this is the shared loader. Tolerates a missing file.
 */
export function loadRootEnv(): void {
  if (existsSync(ROOT_ENV)) {
    process.loadEnvFile(ROOT_ENV);
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `${name} is not set. Add it to the repo-root .env (see .env.example).`,
    );
  }
  return value;
}
