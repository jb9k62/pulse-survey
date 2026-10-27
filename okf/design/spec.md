---
type: Architecture
title: "Spec: multi-tenant pulse surveys"
description: "The plan of record for the slice: what to build, in what order, the rules that must hold, the definition of done, and the decisions settled."
tags: [spec, plan, delivery, multi-tenancy]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: requirements.md
    title: Sections 2, 3, 4, 5, 7 and 8
  - resource: okf/adr/0002-dev-sign-in-with-server-side-sessions.md
    title: The session cookie and the dev-only picker
  - resource: okf/adr/0004-calendar-week-in-utc.md
    title: The week boundary
  - resource: okf/adr/0005-rls-with-a-non-owner-app-role.md
    title: The isolation mechanism
  - resource: okf/adr/0006-zod-at-the-api-edge.md
    title: The validation library
  - resource: okf/adr/0007-no-production-sign-in.md
    title: Why there is no production sign-in
---

# Spec: multi-tenant pulse surveys

The plan of record for the vertical slice. It is short on purpose: the rules, the build order and
the definition of done are here, and the contracts an implementer must not invent live in four
concepts beside it. Reasoning lives in the ADRs and the design notes, so this file states decisions
rather than arguing them.

| Concept | Holds |
| --- | --- |
| [Data model](/pulse-surveys/domain-model.md) | tables, constraints, indexes, the week function, the seed |
| [Tenant isolation](/pulse-surveys/architecture.md) | the two database roles, the thirteen policies, the per-request tenant context, the grants, the repository layout and the test plan |
| [API surface](/pulse-surveys/api.md) | routes and roles, DTO rules, the summary maths, the error contract, session mechanics |
| [Front end](/pulse-surveys/frontend.md) | the five screen states, the Member form, the Manager summary, the CSS plan |

If reality disagrees with any of these files, change the file first, then the code.

## Build order

Each step is done when its stated check passes, not when the code is written.

1. **Database.** Roles and `bootstrap.sql`, the schema, the policies, the four migrations, the seed.
   Done when `npm run db:reset` leaves two organisations with surveys, and `test/rls.spec.ts` fails
   when a policy is dropped from the schema.
2. **Tenant plumbing.** The config and its startup invariants, the auth guard and session service,
   the tenant transaction interceptor, `@CurrentTx()`, `@CurrentUser()`, `@CurrentOrg()`, `@Roles()`.
   Done when a request with no cookie is `401`, a tampered token is `401`, and the API refuses to
   start when the two connection strings are equal or the app role can bypass RLS.
3. **Routes.** `POST /surveys`, `PATCH /surveys/:id`, the submit path and the summary.
   Done when `test/surveys.e2e-spec.ts`, `test/submit.e2e-spec.ts` and `test/summary.e2e-spec.ts` pass.
4. **Front end.** The session provider, the picker, the Member screen and the Manager screen.
   Done when the Playwright journeys in the front end concept pass against the real API.
5. **Delivery.** README run steps, the SOLUTION.md sections, the AWS design note.

## Rules that must hold

| Rule | Enforced in | Record |
| --- | --- | --- |
| The organisation comes from the session, never from a body, query or route parameter | The guard derives it, and every repository takes it as a required argument | [ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md) |
| One organisation cannot read or write another's data | Row-level security, with the API connecting as a role that owns no table | [ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md) |
| A Member reads and writes only their own response | The member predicate on `responses` and `answers` | [ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md) |
| One response per member per survey per week | `UNIQUE (survey_id, user_id, week_start)`, mapped to `409` | [ADR-0004](/adr/0004-calendar-week-in-utc.md) |
| A survey has at most three questions, rating 1 to 5 or yes/no | `CHECK (position between 1 and 3)` with `UNIQUE (survey_id, position)`, and the DTO rules | [Data model](/pulse-surveys/domain-model.md) |
| Managers manage surveys in their own organisation only | `@Roles('manager')` plus the org predicate; another organisation's id is a `404` | [API surface](/pulse-surveys/api.md) |
| The dev picker cannot exist in production | `AUTH_MODE` defaults to `off`, the two dev routes are `404` when off, `AUTH_MODE=dev` unless `NODE_ENV` is `development` or `test` is a startup failure, and the dev functions are granted to `pulse_app` only by the seed | [ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md) |
| The summary maths is correct, including the empty week | One module counts and divides; null ratios are `null`, never `NaN` | [API surface](/pulse-surveys/api.md) |

## Scope

In: the seven tables, the dev sign-in, the survey endpoints, the two React flows, seed data for two
organisations, and the tests named in the test plan.

Out, and deliberately: real identity providers ([ADR-0007](/adr/0007-no-production-sign-in.md)), survey
editing after a response exists (archive only), per-organisation timezones, drafts, response
deletion, audit trails, pagination, and any UI beyond the two flows. Each is a known gap in
`SOLUTION.md` rather than half-built code.

## Definition of done

```text
npm run db:reset        two organisations, seeded, non-empty current week
npm run typecheck       no errors, strict mode
npm run lint            no errors, no explicit any
npm run test            API unit tests and web component tests pass
npm run test:e2e        API e2e against pulse_test as pulse_app (the RLS suite runs under npm test)
npm run test:e2e:web    Playwright journeys pass against the seeded stack
npm run okf:validate    0 issues
```

## Decisions settled

Both open questions were answered on 2026-09-26, so everything in this spec is settled.

1. **API-edge validation: Zod 4 with Nest's `StandardSchemaValidationPipe`**, registered once as an
   `APP_PIPE` provider, with the schema attached per parameter (`@Body({ schema })`,
   `@Query({ schema })`). One schema language covers the DTOs, the query parameters and the
   environment config, and unknown keys are stripped, which is what makes "an `organisationId` in
   the body is never read" structural rather than a promise. The pipe ships in `@nestjs/common` at
   this pin, and the pinned sample at `references/nest/sample/35-zod-validation` proves the shape
   with zod 4.6.5. See [ADR-0006](/adr/0006-zod-at-the-api-edge.md).
2. **No production sign-in.** The session layer stays production-shaped, and the dev route is the
   only way to obtain a session, so the deployed application has no way in. An identity provider
   later replaces those two routes and nothing else. Recorded as a known gap in `SOLUTION.md`. See
   [ADR-0007](/adr/0007-no-production-sign-in.md).
