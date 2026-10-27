/**
 * The API contract (okf/design/contract.md sections 2.3 to 2.5) as Zod schemas. The API
 * validates request bodies with them, the web app parses responses with them, and both
 * take their types from `z.infer`, so the two sides cannot drift apart.
 *
 * Node consumers (the API) load the built `dist/`. Bundler consumers (the web app) opt
 * into the `source` export condition and read `src/` directly.
 */

export * from './errors.js';
export * from './session.js';
export * from './surveys.js';
export * from './week.js';
