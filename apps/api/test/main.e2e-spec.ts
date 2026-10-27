import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRootEnv, requireEnv } from '../src/db/load-env.js';

// The other e2e specs build the app through the testing module, so they never run
// src/main.ts. This spec compiles the API and starts the real entry point as a child
// process, to prove the three things only main.ts does: the /api prefix on a real port,
// and the two start-up refusals (config and database invariants), each exiting 1.
//
// The build goes to node_modules/.cache, not dist, so it cannot disturb `nest start
// --watch` or its incremental build info. Inside apps/api, `@pulse/contracts` still
// resolves through the workspace node_modules.
const API_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = fileURLToPath(
  new URL('../node_modules/.cache/main-e2e', import.meta.url),
);
const MAIN = `${OUT_DIR}/main.js`;

interface RunResult {
  code: number | null;
  output: string;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address !== null && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('No port'));
        }
      });
    });
  });
}

let baseEnv: NodeJS.ProcessEnv;

beforeAll(() => {
  loadRootEnv();
  execFileSync(
    'npx',
    [
      'tsc',
      '-p',
      'tsconfig.build.json',
      '--outDir',
      OUT_DIR,
      '--tsBuildInfoFile',
      `${OUT_DIR}/.tsbuildinfo`,
    ],
    { cwd: API_ROOT, stdio: 'pipe' },
  );
  // The child gets exactly this environment. Its loadConfig also tries to load a .env, but
  // the compiled loader in node_modules/.cache resolves that path to apps/api/.env, which does
  // not exist, and process.loadEnvFile never overrides a variable that is already set anyway.
  baseEnv = {
    PATH: process.env.PATH,
    DATABASE_URL_OWNER: requireEnv('TEST_DATABASE_URL_OWNER'),
    DATABASE_URL_APP: requireEnv('TEST_DATABASE_URL_APP'),
    AUTH_MODE: 'dev',
    NODE_ENV: 'test',
  };
}, 120_000);

/** Run main.js to exit, for the refusal cases. */
function runToExit(env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [MAIN], { cwd: API_ROOT, env });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

describe('main.ts (compiled entry point)', () => {
  it('listens on API_PORT with every route under /api', async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [MAIN], {
      cwd: API_ROOT,
      env: { ...baseEnv, API_PORT: String(port) },
    });
    try {
      let health: Response | undefined;
      for (let attempt = 0; attempt < 100 && health === undefined; attempt++) {
        try {
          health = await fetch(`http://127.0.0.1:${port}/api/health`);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      expect(health?.status).toBe(200);
      expect(await health?.json()).toEqual({ status: 'ok' });

      const unprefixed = await fetch(`http://127.0.0.1:${port}/health`);
      expect(unprefixed.status).toBe(404);
    } finally {
      child.kill('SIGTERM');
    }
  }, 30_000);

  it('exits 1 when AUTH_MODE=dev runs outside development', async () => {
    const result = await runToExit({
      ...baseEnv,
      NODE_ENV: 'production',
      API_PORT: String(await freePort()),
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('AUTH_MODE=dev needs NODE_ENV');
  }, 30_000);

  it('exits 1 when the app connection is the table owner', async () => {
    // A second spelling of the owner URL passes the cheap string check in loadConfig, so
    // this reaches assertDatabaseInvariants, which asks the database who it really is. An
    // extra connection parameter changes the string whatever host the URL names.
    const owner = new URL(requireEnv('TEST_DATABASE_URL_OWNER'));
    owner.searchParams.set('application_name', 'main-e2e-owner-check');
    const ownerAgain = owner.toString();
    expect(ownerAgain).not.toBe(requireEnv('TEST_DATABASE_URL_OWNER'));
    const result = await runToExit({
      ...baseEnv,
      DATABASE_URL_APP: ownerAgain,
      API_PORT: String(await freePort()),
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('owns');
  }, 30_000);
});
