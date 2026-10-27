---
type: Architectural Decision
title: "ADR-0006: Zod schemas validated by Nest's StandardSchemaValidationPipe"
description: "One schema library for DTOs, query parameters and configuration, validated at the API edge by the pipe Nest 12 ships."
tags: [validation, api, zod, nestjs, adr]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: requirements.md
    title: Section 4.1.3 and 4.1.5, the rules the DTOs carry
  - resource: references/nest/packages/common/pipes/standard-schema-validation.pipe.ts
    title: StandardSchemaValidationPipe at the pin, which reads the schema from parameter metadata
  - resource: references/nest/sample/35-zod-validation/src/cats/cats.controller.ts
    title: The pinned sample, @Body({ schema }) on the handler parameter
  - resource: references/nest/sample/35-zod-validation/package.json
    title: The sample pins zod 4.6.5
  - resource: okf/pulse-surveys/api.md
    title: The DTO rules this decision validates
---

# ADR-0006: Zod schemas validated by Nest's StandardSchemaValidationPipe

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Jordan Hunt

## Context

`AGENTS.md` requires all input to be validated at the API edge, and the business rules that need it
are specific: a survey has 1 to 3 questions, a question is `rating` or `yes_no`, a rating is an
integer from 1 to 5, a submit carries exactly one answer per question with the value matching the
question's type, and `weekStart` is an optional Monday. The organisation, the user and the week must
never be readable from a request body.

Nest 12 ships two pipes that can do this: `ValidationPipe`, which works with `class-validator`
decorators, and `StandardSchemaValidationPipe`, which works with any library implementing the
Standard Schema interface. The spec left the choice open, so it needed settling before the DTOs were
written.

## Decision

We will use **Zod 4** for every schema the API validates, and Nest's built-in
`StandardSchemaValidationPipe` to run it. The pipe is registered once as an `APP_PIPE` provider, not
in `main.ts`, so the e2e suite exercises the same pipeline the server runs. Each handler attaches its
schema to the parameter: `@Body({ schema: CreateSurveySchema })` and
`@Query({ schema: SummaryQuerySchema })`, because that is where the pipe reads it from.

One schema language covers three jobs: request DTOs, query parameters, and the environment
configuration the startup invariants read. The TypeScript types come from `z.infer`, so the type and
the runtime check cannot drift apart.

## Consequences

### Positive

- **One source of truth per shape.** The DTO type is inferred from the schema, so a field cannot be
  typed one way and validated another, which is the failure mode of decorator metadata.
- **Unknown keys are stripped, not rejected.** That is what makes "an `organisationId` in the body is
  never read" structural rather than a promise, and it keeps the edge strict without breaking clients
  on an extra field.
- **No custom pipe to maintain.** `StandardSchemaValidationPipe` is part of `@nestjs/common` at this
  pin, and its `exceptionFactory` already produces a flat list of path-prefixed messages, which is
  the shape the error contract wants.
- **Zod 4.6.5 is the version the pinned sample proves**, so the pattern is copied from source in this
  repository rather than from a blog post.
- **The same schemas parse the environment**, so a bad `AUTH_MODE` or a missing connection string
  fails at startup with a named field instead of at the first request.

### Trade-offs

- A new runtime dependency in `apps/api` (zod), and a second schema dialect in the repository if
  anyone later adds decorator-validated code. The rule is one library, so the second dialect should
  not appear.
- `StandardSchemaValidationPipe` is newer than `ValidationPipe` and has less community material
  behind it, so an unfamiliar error means reading `references/nest/packages/common/pipes/` rather
  than searching.
- The pipe reads the schema from parameter metadata, so a handler that forgets `@Body({ schema })`
  silently skips validation. Two things contain that: every DTO rule is also a `CHECK` constraint in
  the database, and each rule has an e2e test that sends the bad input and expects a `400`.
- Zod's default messages are developer-facing and path-prefixed (`title: Too big: expected string to
  have <=120 characters`). Messages a person reads come from explicit strings in the schema, which is
  a discipline rather than a default.

## Alternatives considered

| Option | Why rejected |
|---|---|
| `class-validator` with `ValidationPipe` | The mainstream Nest path and well documented, but it needs `class-transformer` as well, the type and the validation are two declarations that can drift, and decorator metadata is a second source of truth for shapes this project already describes in one place. |
| Valibot or ArkType through the same pipe | Interchangeable with Zod here, since the pipe speaks Standard Schema. Zod was chosen because the pinned sample uses it, so the working example is in this repository. |
| Hand-written validation in each service | No new dependency, but every rule becomes a branch, the error shape stops being consistent, and the "strip unknown keys" property would have to be reimplemented per endpoint. |
| Validating in the database only, through `CHECK` constraints | The constraints stay, and they are the backstop, but a `23514` check violation is a `500`-shaped failure with no field name. The API edge has to reject first so the client gets a usable `400`. |
| Trusting the client for the three-question limit | Rejected outright. The limit is also a `CHECK` plus `UNIQUE (survey_id, position)` in the database, and the edge check exists to give a good error, not to be the enforcement. |
