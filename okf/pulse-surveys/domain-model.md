---
type: Data Model
title: "Data model: pulse surveys"
description: "Tables, constraints, indexes, the week function and the seed data for the multi-tenant pulse survey slice."
tags: [data-model, schema, postgres, drizzle, week-boundary]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: okf/design/spec.md
    title: The plan of record this concept was split out of
  - resource: okf/adr/0004-calendar-week-in-utc.md
    title: The week boundary, which decides the column and the constraint
---

# Domain model

Every table uses `uuid` primary keys with `default gen_random_uuid()`
(`references/drizzle-orm/drizzle-orm/src/pg-core/columns/uuid.ts:27`). Roles, question types and
survey status are `text` with a named `CHECK`, not a `pgEnum`: there is no enum type to migrate or
drop, and the TypeScript union comes from `$type<'manager' | 'member'>()`.

| Table | Columns |
| --- | --- |
| `organisations` | `id uuid pk`, `name text not null unique`, `created_at timestamptz not null default now()` |
| `users` | `id uuid pk`, `organisation_id uuid not null -> organisations(id)`, `name text not null`, `role text not null`, `joined_at timestamptz not null`, `deactivated_at timestamptz null`, `created_at timestamptz not null default now()` |
| `sessions` | `id uuid pk`, `user_id uuid not null -> users(id) on delete cascade`, `token_hash text not null`, `created_at timestamptz not null default now()`, `expires_at timestamptz not null` |
| `surveys` | `id uuid pk`, `organisation_id uuid not null -> organisations(id)`, `title text not null`, `status text not null default 'active'`, `created_at timestamptz not null default now()` |
| `questions` | `id uuid pk`, `organisation_id uuid not null`, `survey_id uuid not null`, `position smallint not null`, `type text not null`, `prompt text not null` |
| `responses` | `id uuid pk`, `organisation_id uuid not null`, `survey_id uuid not null`, `user_id uuid not null -> users(id)`, `week_start date not null`, `submitted_at timestamptz not null default now()` |
| `answers` | `id uuid pk`, `survey_id uuid not null`, `response_id uuid not null`, `question_id uuid not null`, `rating_value smallint null`, `yes_no_value boolean null` |

`questions` and `responses` carry the tenant column even though the survey implies it, so their
policies are plain column comparisons and the composite foreign keys make the redundant column hard
to get wrong. `answers` has no tenant column: its policy reads the tenant through `responses`
([Tenant isolation](/pulse-surveys/architecture.md)). `week_start` uses the default `date` mode, so it is a `YYYY-MM-DD` string in TypeScript
(`references/drizzle-orm/drizzle-orm/src/pg-core/columns/date.ts:98-113`).

## Constraints and indexes

Every constraint, index and policy has an explicit snake_case name, so migrations diff cleanly and an
error names the rule it broke.

```sql
-- identity, and the targets of the composite foreign keys
UNIQUE (organisation_id, id) ON users
UNIQUE (organisation_id, id) ON surveys
UNIQUE (survey_id, id)       ON questions
UNIQUE (survey_id, id)       ON responses
FOREIGN KEY (organisation_id, survey_id) REFERENCES surveys(organisation_id, id)   -- questions, responses
FOREIGN KEY (organisation_id, user_id)   REFERENCES users(organisation_id, id)     -- responses
FOREIGN KEY (survey_id, question_id)     REFERENCES questions(survey_id, id)       -- answers
FOREIGN KEY (survey_id, response_id)     REFERENCES responses(survey_id, id)       -- answers

-- the business rules, in the database
UNIQUE (survey_id, user_id, week_start) ON responses   -- one response per member per survey per week
UNIQUE (survey_id, position)            ON questions   -- with the CHECK below, at most 3 questions
CHECK (position BETWEEN 1 AND 3)        ON questions
UNIQUE (response_id, question_id)       ON answers     -- one answer per question per response
CHECK (num_nonnulls(rating_value, yes_no_value) = 1)   ON answers
CHECK (rating_value IS NULL OR rating_value BETWEEN 1 AND 5) ON answers
CHECK (role   IN ('manager', 'member'))  ON users
CHECK (status IN ('active', 'archived')) ON surveys
CHECK (type   IN ('rating', 'yes_no'))   ON questions
CHECK (deactivated_at IS NULL OR deactivated_at >= joined_at) ON users
CHECK (joined_at <= created_at)          ON users
CHECK (expires_at > created_at)          ON sessions
CHECK (token_hash ~ '^[0-9a-f]{64}$')    ON sessions

CREATE UNIQUE INDEX sessions_token_hash_key    ON sessions (token_hash);   -- one row per token lookup
CREATE UNIQUE INDEX surveys_one_active_per_org ON surveys (organisation_id) WHERE status = 'active';
CREATE INDEX users_organisation_idx     ON users (organisation_id);
CREATE INDEX sessions_user_idx          ON sessions (user_id);
CREATE INDEX sessions_expires_idx       ON sessions (expires_at);
CREATE INDEX responses_org_week_idx     ON responses (organisation_id, week_start);
CREATE INDEX responses_survey_week_idx  ON responses (survey_id, week_start);
CREATE INDEX answers_response_idx       ON answers (response_id);
```

The three-question limit is `CHECK` plus `UNIQUE (survey_id, position)`, so a fourth question is
unrepresentable rather than counted. Drizzle builders at the pin: `unique` and `uniqueIndex`
(`unique-constraint.ts:6`, `indexes.ts:249`), `check` (`checks.ts:30`), `foreignKey`
(`foreign-keys.ts:98`), with the table's third argument as an array.

Two deliberate choices beyond `requirements.md`: `surveys_one_active_per_org` and the archive-only
`PATCH /api/surveys/:id` ([API surface](/pulse-surveys/api.md)) keep "the organisation's active survey" singular, which is what
the Member screen shows. Requirement 4.1.4's "manage" is create plus archive; no edit and no delete.

## The week function

`apps/api/src/surveys/week.ts` exports `weekStartOf(instant)`, the SQL fragment
`date_trunc('week', <instant> at time zone 'utc')::date` ([ADR-0004](/adr/0004-calendar-week-in-utc.md)),
plus `isWeekStart(dateString)` (a pure Monday check) and `weekLabel(start)` (pure formatting of a
stored date string into `Mon 21 Sep to Sun 27 Sep`). Submit and summary both call `weekStartOf`, and
it is the only place a week is computed. The client never sends the week and a `week_start` in a
request body is ignored: no DTO carries a week field and the value is never read.

## Seed

`apps/api/src/db/seed.ts` exports `runSeed(ownerDb)` over the fixed ids in `fixtures.ts`. The seed
runs as `pulse_owner`, computes the current week with the same module, and is safe to re-run: every
insert uses `onConflictDoNothing` on a natural key
(`references/drizzle-orm/drizzle-orm/src/pg-core/query-builders/insert.ts`).

- Two organisations, `Acme Manufacturing` and `Blue River Health`.
- Each has **two Managers** and four Members (requirement 4.1.8): one Member joined 30 days ago, one
  joined mid-week, one deactivated the day before the current week starts, one deactivated mid-week.
  The last two are the seeded denominator cases, computed from `weekStartOf(now())`, never hard-coded.
- Each has one active survey with three questions (rating, yes/no, rating). Blue River also has an
  archived survey, so the active filter has something to exclude. Acme has two responses in the
  current week and Blue River one, so both summaries are non-empty and differ; the zero-response
  case belongs to the tests.
