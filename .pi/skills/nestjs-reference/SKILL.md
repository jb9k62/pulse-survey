---
name: nestjs-reference
description: >
  Map of verified NestJS v12 patterns inside this repo's pinned source checkout at
  references/nest. Covers guards and role checks, DTO validation, exception filters,
  interceptors, e2e testing with supertest, request scoping and database modules.
  Use when writing, reviewing or debugging NestJS code in this project, and before
  inventing an API or copying an example from a blog or older NestJS version.
---

# NestJS reference

The NestJS source is vendored in this repo as a read-only git submodule, pinned to the
latest stable release. It is the source of truth for how NestJS actually behaves in the
version we use, so read it instead of guessing.

- Source: `references/nest`
- Pinned at commit `6739656fa3e8c98bd55883f0363a2254e6412232`, which is tag `v12.1.0` (shallow, depth 1)
- Missing after a clone: `git submodule update --init --depth 1`

The commit is the authoritative pin. A fresh clone fetches that one commit, not the tag ref, so
`git describe --tags` inside the submodule can fail with "No names found". Confirm the version from
`references/nest/packages/core/package.json` instead, which reads `"version": "12.1.0"`.

Every path below is relative to the **repository root**. This skill file lives at
`.pi/skills/nestjs-reference/SKILL.md`.

Treat the submodule as read-only. Never edit it, never import from it, never add it to
`tsconfig` paths. It is reference material only.

## Rule

Do not invent NestJS APIs. Find the pattern in `references/nest` first, then write the
project code to match. The samples and the `integration/` suites are real, tested code,
so they beat any prose description, including this file.

## Where to look

| I need to... | Read |
|---|---|
| Check a role or permission | `references/nest/sample/01-cats-app/src/common/guards/roles.guard.ts` |
| Write a metadata decorator | `references/nest/sample/01-cats-app/src/common/decorators/roles.decorator.ts` (one line, `Reflector.createDecorator`) |
| Attach the current user to the request | `references/nest/sample/19-auth-jwt/src/auth/auth.guard.ts` |
| Exempt a route from a global guard | `references/nest/sample/19-auth-jwt/src/auth/decorators/public.decorator.ts` |
| Register a guard globally | `references/nest/sample/19-auth-jwt/src/auth/auth.module.ts` (`APP_GUARD`) || Write a DTO with class-validator | `references/nest/sample/01-cats-app/src/cats/dto/create-cat.dto.ts` |
| Register a global `ValidationPipe` | `references/nest/sample/01-cats-app/src/main.ts` |
| See how `ValidationPipe` works inside | `references/nest/packages/common/pipes/validation.pipe.ts` |
| Validate with Zod instead | `references/nest/sample/35-zod-validation/src/cats/` |
| Parse a route param safely | `references/nest/sample/01-cats-app/src/common/pipes/parse-int.pipe.ts`, `references/nest/packages/common/pipes/parse-uuid.pipe.ts` |
| Shape an error response | `references/nest/sample/01-cats-app/src/common/filters/http-exception.filter.ts`, `references/nest/packages/core/exceptions/base-exception-filter.ts` |
| Shape a success response | `references/nest/sample/01-cats-app/src/core/interceptors/transform.interceptor.ts`, `references/nest/sample/21-serializer/` |
| Write an e2e test with supertest | `references/nest/integration/hello-world/e2e/hello-world.spec.ts` |
| Override a provider in a test | `references/nest/integration/testing-module-override/e2e/modules-override.spec.ts` |
| Understand `Test.createTestingModule` | `references/nest/packages/testing/testing-module.builder.ts` |
| Use request-scoped providers | `references/nest/integration/scopes/e2e/request-scope.spec.ts` |
| Wire a database module with async config | `references/nest/integration/typeorm/src/database.module.ts`, `references/nest/integration/typeorm/src/async-options.module.ts` |
| Copy a repository-style service | `references/nest/sample/05-sql-typeorm/src/users/users.service.ts` |
| See a full DB-backed e2e suite | `references/nest/integration/typeorm/e2e/typeorm.spec.ts` |

TypeORM, Mongoose and Sequelize appear in the samples only as examples of the NestJS
module and injection pattern. We use Drizzle, so read those files for the NestJS shape
(`forRootAsync`, provider tokens, module boundaries) and take the query style from the
Drizzle reference instead.

## Version gotchas

These are real differences in v12 that older tutorials get wrong.

- The samples are ESM. `sample/01-cats-app/package.json` sets `"type": "module"` and
  `tsconfig.json` sets `module: nodenext`, so imports carry a `.js` extension even for
  `.ts` files (`from './app.module.js'`). Our own module system is our choice, but if we
  go ESM, copy that convention exactly.
- Decorators need `useDefineForClassFields: false` and `emitDecoratorMetadata: true`.
  Both are set in the samples and in `references/nest/tsconfig.json`.
- The samples set `strictPropertyInitialization: false`, because DTO and entity fields are
  assigned by the framework. Our project requires TypeScript strict mode, so do not copy
  that flag. Use the definite assignment assertion (`name!: string`) or declare the field
  and let validation fill it. Record the choice if it spreads.
- `Reflector.createDecorator` is the current way to write a metadata decorator. It replaces
  the older hand-rolled `SetMetadata` plus typed `Reflector.get` pair.
- The samples pin `class-validator` 0.15.1 and `class-transformer` 0.5.1.

## Project rules that override the samples

- Tenant isolation comes first. The organisation always comes from the authenticated user.
  Never read an organisation id from a request body, a query string or a route param. A
  guard that attaches the user is not enough on its own: the repository or service must
  still scope every query by the organisation from that user.
- Role checks are `Manager` and `Member` only.
- Validate every input at the API edge, and validate that answers match their question type.
- Every tenant-scoped endpoint needs a test proving org A cannot read or write org B data.
  Use the `integration/testing-module-override` pattern for that.
