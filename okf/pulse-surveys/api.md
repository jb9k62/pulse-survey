---
type: API Reference
title: "API surface: routes, DTOs and the summary maths"
description: "Every route with its role, the DTO rules, the summary arithmetic, the error contract and the session mechanics."
tags: [api, nestjs, dtos, summary, sessions]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: okf/design/spec.md
    title: The plan of record this concept was split out of
  - resource: okf/adr/0002-dev-sign-in-with-server-side-sessions.md
    title: The session cookie and the dev-only picker
---

# API surface

Nest sets `app.setGlobalPrefix('api')`. The guards, the validation pipe and the exception filter are
registered as `APP_GUARD`, `APP_PIPE` and `APP_FILTER` providers, never in `main.ts`, so the e2e
suite exercises the same pipeline the server runs. Authentication is default deny: only the routes
marked `@Public()` (health, `/me` and the two dev routes) work without a session.

| Method | Path | Who | Request | Success |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | anyone, `@Public()` | - | `200 { "status": "ok" }` |
| GET | `/api/me` | anyone, `@Public()` | - | `200 SessionState` (a null principal when signed out) |
| GET | `/api/dev/users` | anyone, dev only | - | `200 { "users": DevUser[] }`, `404` when `AUTH_MODE=off` |
| POST | `/api/dev/sessions` | anyone, dev only | `{ userId }` | `201 SessionState` and the cookie; `404` when off, unknown or deactivated |
| DELETE | `/api/sessions` | authenticated | - | `204`, the row is deleted and the cookie cleared |
| GET | `/api/surveys/active` | Member | - | `200 { survey, week, hasRespondedThisWeek }`, `survey: null` when the organisation has none |
| GET | `/api/surveys` | Manager | - | `200 { "surveys": SurveyListItem[] }` |
| POST | `/api/surveys` | Manager | `CreateSurvey` | `201 { "survey": SurveyDetail }` |
| PATCH | `/api/surveys/:id` | Manager | `{ status }` | `200 { "survey": SurveyListItem }`; `409` if it would make two active |
| POST | `/api/surveys/:id/responses` | Member | `{ answers }` | `201 { "response": { id, week } }`; `409` duplicate or archived |
| GET | `/api/surveys/:id/summary` | Manager | `?weekStart=YYYY-MM-DD` | `200 Summary` |

`/api/me` is the bootstrap route: the only route that answers with a null principal, so the client
can tell "not signed in, dev sign-in available" from "not signed in, sign-in is disabled here".
`GET /api/surveys/active` returns `survey: null` with the current week and
`hasRespondedThisWeek: false` when the organisation has no active survey, so the Member screen has
one empty state and no error path. The summary's `weekStart` is optional and defaults to the current
week; a Manager may ask for a past Monday. It is a lookup key for a stored column, never a boundary:
the server validates it as a Monday, and it cannot widen scope because the policy and the
organisation are unchanged. The list at `GET /api/surveys` is not filtered by status: it returns
every survey of the session's organisation, archived included, newest first, and only
`GET /api/surveys/active` filters on `status`.

```jsonc
// SessionState (signed out: signedIn false and three nulls)
{ "signedIn": true, "user": { "id", "name" }, "organisation": { "id", "name" },
  "role": "member", "devSignIn": true }
// DevUser        { id, name, role, organisation: { id, name } }
// Week           { start: "2026-09-21", end: "2026-09-27", label: "Mon 21 Sep to Sun 27 Sep" }
// SurveyDetail   { id, title, status, questions: [{ id, position, type, prompt }] }
// SurveyListItem { id, title, status, questionCount, weekStart }

// Summary
{ "survey": { "id", "title", "status" }, "week": Week,
  "completion": { "completed": 2, "eligible": 3, "rate": 0.6666666666666666 },
  "questions": [ { "id", "position", "type", "prompt", "average": 4.5, "count": 2 },
                 { "id", "position", "type", "prompt", "yes": 1, "no": 1 } ] }
```

## Validation at the edge

DTOs are declared once as Zod schemas and validated with a global pipe. The schema is attached per
parameter, `@Body({ schema })` and `@Query({ schema })`, because `StandardSchemaValidationPipe` reads
`metadata.schema`
(`references/nest/sample/35-zod-validation/src/cats/cats.controller.ts:10`), and the pipe is registered
as an `APP_PIPE` provider so the e2e suite runs the same pipeline as the server
([ADR-0006](/adr/0006-zod-at-the-api-edge.md)). Unknown keys are ignored,
not rejected: the schema strips them, so an `organisationId`, `userId`, `role` or `week_start` in a
body is never read. That is [ADR-0004](/adr/0004-calendar-week-in-utc.md)'s "ignored rather than
trusted", kept literally: the organisation comes only from the session and the week only from
`weekStartOf(now())`. The same rules are restated as `CHECK` constraints, the backstop.

| DTO | Rules |
| --- | --- |
| `CreateSurvey` | `title` a trimmed string of 1 to 120 characters; `questions` an array of 1 to 3; each `type` in `rating` or `yes_no`; each `prompt` a trimmed string of 1 to 200 |
| `PatchSurvey` | `status` in `active` or `archived` |
| `SubmitResponse` | `answers` exactly one entry per question of the survey, no extras; each `questionId` a uuid of that survey; exactly one of `rating` (an integer 1 to 5) or `yesNo` (a boolean), matching the question's `type` |
| `DevSession` | `userId` a uuid |
| summary query | `weekStart` optional, `YYYY-MM-DD`, and a Monday (`isWeekStart`), else `400` |

Submit is all or nothing in one transaction, with one answer per question of the survey and no
drafts: one `responses` row with `week_start` from `weekStartOf(now())`, then one `answers` row per
question, each carrying `survey_id`, `response_id` and `question_id` from the survey and the session,
never from the body. A second submit in the week hits `UNIQUE (survey_id, user_id, week_start)`;
`onConflictDoNothing(...).returning()` turns the empty result into a `409` rather than a `500`. An
archived survey is also a `409`, and a survey id in another organisation is a `404`, because the
policy means the lookup finds no row.

## Summary maths

`apps/api/src/surveys/summary.math.ts` holds the pure arithmetic, `summary.service.ts` holds the SQL.
It is the only code in the project that counts or divides.

```text
eligible  = count(users in the organisation where
                    (role = 'member'
                     and joined_at < week_start + interval '7 days'
                     and (deactivated_at is null or deactivated_at >= week_start))
                    or <the user responded to this survey in this week>)
completed = count(responses where survey_id = survey and week_start = week_start)
rate      = eligible = 0 ? null : completed / eligible          // never clamped, never > 1
rating    = count = 0 ? { average: null, count: 0 } : { average: avg(rating_value), count }
yes/no    = { yes: count(yes_no_value = true), no: count(yes_no_value = false) }   // both 0 if unanswered
```

The window is written half-open (`joined_at < week_start + 7 days`) so the last microsecond of
Sunday is not lost; the settled rule words it as `joined_at <= week end`, the same set except for a
join inside that last microsecond. The rate invariant holds because every submitter is an active
member at submit time (the guard's `deactivated_at` check, in
[Tenant isolation](/pulse-surveys/architecture.md)), the week is always the
current one, and the denominator counts everyone who joined before the week ended and had not left
before it started, so `completed` is a subset of `eligible`. `role` is today's role, though, so a
respondent later promoted to Manager would drop out of the Member branch; the second branch keeps
every respondent in the denominator, which makes `completed <= eligible` true by construction
(tested in `test/summary-eligibility.spec.ts`).

`avg()` returns `SQL<string | null>` at this pin, because PostgreSQL returns numerics as text
(`references/drizzle-orm/drizzle-orm/src/sql/functions/aggregate.ts:51`), so the service converts and
null-checks before the maths. `count()` is already a number (`aggregate.ts:19`). Undefined ratios are
JSON `null`, never `NaN`: a zero-response week returns zero counts and null averages, and zero
eligible members returns a null rate. The rate is not clamped, because clamping would hide a
denominator bug; a test asserts it never exceeds 1.

## Error contract

One filter produces every error, so the body is predictable:

```json
{ "statusCode": 400, "error": "Bad Request", "message": ["title must be shorter than 120 characters"],
  "path": "/api/surveys", "timestamp": "2026-09-26T10:00:00.000Z" }
```

| Status | When |
| --- | --- |
| `400` | validation failure, a malformed or non-Monday `weekStart`, an answer whose type does not match its question |
| `401` | no session, a tampered token, an expired session, or a session whose user has been deactivated |
| `403` | a role refusal: a Manager route called with a Member session, or the reverse |
| `404` | an unknown id, or a resource that belongs to another organisation (never `403`, so existence does not leak) |
| `409` | a duplicate submit for the week, a submit to an archived survey, a second active survey |
| `500` | anything unexpected; logged with the request path, no internals in the body |

A PostgreSQL unique violation (`23505`) becomes `409` only for the constraints named in this spec,
and only where it is raised: the duplicate submit through `ON CONFLICT DO NOTHING`, the second
active survey through a catch in the surveys service. The global filter maps no database error, so
any other one stays a `500`.

## Session mechanics

The token is 256 random bits, base64url in an httpOnly cookie, and the database stores only its
SHA-256 hex hash. Cookie options: `httpOnly`, `sameSite: 'lax'`, `path: '/'`,
`maxAge: SESSION_TTL_HOURS * 3600` (Nest's `maxAge` is in seconds, not milliseconds,
`references/nest/packages/common/interfaces/http/cookie-options.interface.ts:24-28`), and `secure`
outside local development. The cookie is not signed: it carries an opaque lookup key, and the
database comparison is the check
([ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md)). The guard hashes the presented
token and treats `expires_at <= now()` or a deactivated user as no session. Logout deletes the row,
not only the cookie. Session creation is the dev route only, and production sign-in is out of scope
([ADR-0007](/adr/0007-no-production-sign-in.md)).
