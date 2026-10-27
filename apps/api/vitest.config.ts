import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite resolves the path aliases declared in tsconfig.json itself, including
  // the ones `nest g library` adds. The Nest CLI scaffolds the
  // `vite-tsconfig-paths` plugin for this instead, but that plugin pulls in
  // tsconfck@3, whose TypeScript peer is ^5, while this workspace is on
  // TypeScript 6.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 30_000,
  },
});
