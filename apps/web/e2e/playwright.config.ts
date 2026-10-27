/**
 * The Playwright config for the three two-organisation journeys.
 *
 * The runner is bundled in the already-installed `playwright` root
 * devDependency at 1.63.0, so the import is `playwright/test`, never
 * `@playwright/test` (which is not installed).
 *
 * Two `webServer` entries are waited on before the first test: the API with
 * `AUTH_MODE=dev` and the Vite dev server. `cwd` is resolved against the
 * config directory (apps/web/e2e), so `../../..` is the repo root without
 * `__dirname` or `import.meta`, which matters because this package is
 * `"type": "module"` and the config loads as ESM.
 *
 * The API is polled on its own port, never through the Vite proxy: while the
 * API is still compiling, Vite answers `/api/health` with a proxy error, which
 * reads as ready and would let a test start early.
 */

import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  // One worker and no retries: the three journeys share one seeded database,
  // the read journey must run before the write journey, and a retry would hide
  // an ordering or data defect.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',

  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // `env` merges with process.env, and `process.loadEnvFile` does not
      // overwrite an existing variable, so this forces the picker on even if
      // the developer's .env says off. NODE_ENV is set too: dev sign-in is refused
      // unless NODE_ENV is development or test.
      command: 'npm run start -w apps/api',
      cwd: '../../..',
      env: { AUTH_MODE: 'dev', NODE_ENV: 'development' },
      url: 'http://127.0.0.1:3000/api/health',
      timeout: 120_000,
      // Nest logs to stdout; without this, a startup-invariant refusal would be
      // invisible in a failed run.
      stdout: 'pipe',
      stderr: 'pipe',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -w apps/web -- --port 5173 --strictPort',
      cwd: '../../..',
      url: 'http://127.0.0.1:5173',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
