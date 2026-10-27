import { fileURLToPath } from 'node:url';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { defaultClientConditions, loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `loadEnv` reads .env from the repo root with an empty prefix, so a
  // non-`VITE_` variable such as API_PORT is visible. `process.env` still wins
  // over the file.
  const env = loadEnv(
    mode,
    fileURLToPath(new URL('../..', import.meta.url)),
    '',
  );
  const apiPort = env.API_PORT ?? '3000';

  return {
    plugins: [
      react(),
      // React Compiler must run first in the Babel pipeline, so the preset goes
      // in on its own, before any other Babel plugin.
      // See references/react.dev/src/content/learn/react-compiler/installation.md
      babel({ presets: [reactCompilerPreset()] }),
    ],
    resolve: {
      // `@pulse/contracts` exports its TypeScript source under `source`, so the
      // web app needs no build step for it and picks up edits straight away.
      conditions: ['source', ...defaultClientConditions],
    },
    server: {
      // Same-origin in development: the cookie is first-party and no CORS is
      // configured. The string shorthand is valid, so no changeOrigin.
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
