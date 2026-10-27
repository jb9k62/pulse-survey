import { defineConfig } from 'vitest/config';

export default defineConfig({
  // See vitest.config.ts for why the native resolver replaces the
  // `vite-tsconfig-paths` plugin the Nest CLI scaffolds.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 30_000,
  },
});
