---
type: Architectural Decision
title: "ADR-0008: One shared contracts package of Zod schemas for the API and the web app"
description: "The request and response shapes live once, as Zod schemas in packages/contracts. The API validates bodies with them, the web app parses responses with them, and both infer their types."
tags: [api, web, zod, contract, workspace, adr]
generated: { by: claude-opus-5-5, at: 2026-09-26 }
sources:
  - resource: okf/design/contract.md
    title: Sections 2.3 to 2.5, the shapes the package encodes
  - resource: okf/adr/0006-zod-at-the-api-edge.md
    title: Zod at the API edge, which this extends to the client
  - resource: packages/contracts/package.json
    title: The export conditions (source for bundlers, dist for Node)
---

# ADR-0008: One shared contracts package of Zod schemas

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Jordan Hunt

## Context

The API declared its response shapes as TypeScript interfaces (`survey.types.ts`) and its request
shapes as Zod schemas (`dto/`). The web app mirrored the response shapes by hand in
`src/api/types.ts` and checked them with about 360 lines of hand-written type guards in
`src/api/parsers.ts`. The front end concept had rejected a shared package ("one consumer, so a
shared types package would add a build step for no gain"). A patterns review flagged the two copies
as a drift risk: a field renamed on one side typechecks on both and fails only at runtime. The human
chose the shared package over keeping the copies or adding Zod to the web app only.

## Decision

We will keep every request and response shape once, as Zod schemas in the `@pulse/contracts`
workspace (`packages/contracts`). The API validates bodies, params and queries with them through
`StandardSchemaValidationPipe`, the web app parses every response with them, and both take their
types from `z.infer`.

The package exports two conditions. Node (the API, at runtime and in its tests) loads the built
`dist/`, because Node does not strip types from a file under `node_modules`. Vite and the web
`tsc` opt into the `source` condition and read `src/` directly, so the web app needs no build step
and sees edits immediately. The API workspace builds the package before `build`, `typecheck`,
`start`, `test` and `test:e2e`, and the root `postinstall` builds it after a fresh install.

## Consequences

### Positive

- The two sides cannot drift: a renamed field fails the type check in whichever app still uses the
  old name.
- The client's validation is the server's validation. The hand-written guards, and the tests that
  pinned their error strings, are gone.
- `isWeekStart` lives in one place, so the client and the server agree on what a valid week key is.

### Trade-offs

- A third workspace and a build step for the API. `nest start --watch` does not rebuild the package,
  so an edit to a schema needs `npm run build -w @pulse/contracts` (or a restart) before the API sees
  it.
- Zod now ships to the browser. The web bundle is 331.5 kB (100.6 kB gzip) after this change.
- Zod's messages replace the hand-written parser messages, so a malformed payload now reads
  `SessionState: user: Invalid input: expected null, received object`. They still name the payload
  and the field.
- The root `node_modules` holds zod 3 (a transitive dependency of the mermaid CLI), so zod 4 is
  installed per workspace. The web app does not import `zod` itself; its parser helper is typed
  structurally.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Keep the hand-written types and parsers | No build step, but the drift risk stays and the review finding stays open. |
| Zod in the web app only | Shrinks the web code, but the API and the web app would still keep separate copies of every shape. |
| Generate the client from an OpenAPI document | Needs a Swagger module and a code generator, both new tools for eleven routes. |
| Point the API at the TypeScript source too | `nest build` would compile files outside `rootDir`, and Node cannot run `.ts` from `node_modules`, so the API needs the built output. |
