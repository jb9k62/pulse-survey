---
type: Reference
title: "Contract: tables, endpoints, fields, environment and scripts"
description: "The frozen shapes every later slice must match: the seven tables with their constraints, indexes and policies, the HTTP surface with roles and payloads, the exact field names the front end consumes, and the environment and root scripts."
tags: [contract, api, data-model, environment]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: okf/design/spec.md
    title: The plan of record this contract serves
  - resource: okf/pulse-surveys/domain-model.md
    title: Tables, constraints, indexes, the week function and the seed
  - resource: okf/pulse-surveys/architecture.md
    title: Roles, policies, the tenant context, grants and the test plan
  - resource: okf/pulse-surveys/api.md
    title: Routes, DTO rules, the summary maths, errors and sessions
  - resource: okf/pulse-surveys/frontend.md
    title: The five screen states and the field names the client consumes
  - resource: .env.example
    title: The environment variables, copied verbatim
  - resource: package.json
    title: The root npm scripts, copied verbatim
---

# Contract: multi-tenant pulse surveys

This file freezes the names and shapes the four concepts describe, so no later slice has to
guess and none can drift. It copies; it does not add behaviour. Reasoning lives in the ADRs,
the test plan lives in [Tenant isolation](/pulse-surveys/architecture.md), and the build order
lives in [Spec](/design/spec.md). If reality disagrees with this file, change the concept and
then this file, then the code.

Section 5 lists the places where a concept contradicts itself or leaves a shape unnamed, and
the ruling this contract makes. Those rulings are part of the contract.

## 0. Rules that cannot move

1. The organisation comes only from the authenticated user's `sessions` row. Never from a body,
   a query string or a route parameter.
2. One response per Member per survey per active week, enforced by
   `UNIQUE (survey_id, user_id, week_start)` in the database, not only in code.
3. A survey has 1 to 3 questions. A question is `rating` (integer 1 to 5) or `yes_no` (boolean).
4. The dev picker is off by default, its two routes are `404` when off, and `AUTH_MODE=dev` unless `NODE_ENV` is `development` or `test` is a
   startup failure. Migrations never grant the dev functions to `pulse_app`; only the seed does.
5. A week is an ISO 8601 calendar week in UTC. Only `weekStartOf` computes it, on the server.
   A `week_start` or `weekStart` in a request body is stripped and never read.
6. Undefined summary ratios are JSON `null`, never `NaN`.
7. Roles are the lowercase strings `'manager'` and `'member'` in the database and in JSON.
   "Manager" and "Member" with capitals are prose only.
8. TypeScript strict mode. No `any` without a comment saying why.

## 1. Database

### 1.1 Roles and databases

| Role | Flags | What it is for |
| --- | --- | --- |
| `pulse_owner` | owns the `public` schema | migrations and the seed. The API never uses it. |
| `pulse_app` | `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, owns no table | the API connection. Subject to every policy with no `FORCE ROW LEVEL SECURITY` needed. |

Both are declared as `pgRole('<name>').existing()`, so drizzle-kit never emits `CREATE ROLE` or
`DROP ROLE`. `apps/api/db/bootstrap.sql` creates them, idempotently, together with the databases
`pulse` (`ALTER DATABASE pulse OWNER TO pulse_owner`) and `pulse_test` (owned by `pulse_owner`).
It runs as the Compose superuser and reads its two passwords from the psql variables
`owner_password` and `app_password`, which `npm run db:bootstrap` passes from
`POSTGRES_PASSWORD`. Local development passwords only.

Startup invariants, checked before the API listens, all failures fatal:

1. `DATABASE_URL_OWNER` and `DATABASE_URL_APP` are both set and are not equal.
2. The app connection's `current_user` is neither `rolsuper` nor `rolbypassrls`.
3. The app connection owns no table in any schema, and is not a member of (cannot `SET ROLE` to) a
   role that is superuser, `BYPASSRLS` or owns a table.
4. `AUTH_MODE` is `off` or `dev`, and `AUTH_MODE=dev` unless `NODE_ENV` is `development` or `test` is refused.
5. The app connection can call the dev sign-in functions exactly when `AUTH_MODE=dev`: any grant with
   `off` is refused, and a missing grant with `dev` is refused.

### 1.2 Tables and columns

Every table has a `uuid` primary key on `id` with `default gen_random_uuid()` (Drizzle
`uuid().primaryKey().defaultRandom()`). `timestamptz` is `timestamp with time zone`.
`week_start` is a `date` in the default Drizzle string mode, so it is a `YYYY-MM-DD` string in
TypeScript. `smallint` is `smallint`; `boolean` is `boolean`.

| Table | Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| `organisations` | `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `organisations` | `name` | `text` | no | - | unique |
| `organisations` | `created_at` | `timestamptz` | no | `now()` | |
| `users` | `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `users` | `organisation_id` | `uuid` | no | - | foreign key to `organisations(id)` |
| `users` | `name` | `text` | no | - | |
| `users` | `role` | `text` | no | - | `'manager'` or `'member'` |
| `users` | `joined_at` | `timestamptz` | no | - | no default; supplied by the seed |
| `users` | `deactivated_at` | `timestamptz` | yes | - | null means active |
| `users` | `created_at` | `timestamptz` | no | `now()` | |
| `sessions` | `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `sessions` | `user_id` | `uuid` | no | - | foreign key to `users(id)`, `on delete cascade` |
| `sessions` | `token_hash` | `text` | no | - | 64 lowercase hex characters (SHA-256) |
| `sessions` | `created_at` | `timestamptz` | no | `now()` | |
| `sessions` | `expires_at` | `timestamptz` | no | - | |
| `surveys` | `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `surveys` | `organisation_id` | `uuid` | no | - | foreign key to `organisations(id)` |
| `surveys` | `title` | `text` | no | - | |
| `surveys` | `status` | `text` | no | `'active'` | `'active'` or `'archived'` |
| `surveys` | `created_at` | `timestamptz` | no | `now()` | |
| `questions` | `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `questions` | `organisation_id` | `uuid` | no | - | tenant column, composite foreign key |
| `questions` | `survey_id` | `uuid` | no | - | composite foreign key to `surveys` |
| `questions` | `position` | `smallint` | no | - | 1, 2 or 3 |
| `questions` | `type` | `text` | no | - | `'rating'` or `'yes_no'` |
| `questions` | `prompt` | `text` | no | - | |
| `responses` | `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `responses` | `organisation_id` | `uuid` | no | - | tenant column, composite foreign keys |
| `responses` | `survey_id` | `uuid` | no | - | composite foreign key to `surveys` |
| `responses` | `user_id` | `uuid` | no | - | composite foreign key to `users` |
| `responses` | `week_start` | `date` | no | - | from `weekStartOf(now())`, `YYYY-MM-DD` |
| `responses` | `submitted_at` | `timestamptz` | no | `now()` | |
| `answers` | `id` | `uuid` | no | `gen_random_uuid()` | primary key |
| `answers` | `survey_id` | `uuid` | no | - | composite foreign keys |
| `answers` | `response_id` | `uuid` | no | - | composite foreign key to `responses` |
| `answers` | `question_id` | `uuid` | no | - | composite foreign key to `questions` |
| `answers` | `rating_value` | `smallint` | yes | - | 1 to 5, set only for `rating` |
| `answers` | `yes_no_value` | `boolean` | yes | - | set only for `yes_no` |

`questions` and `responses` carry the tenant column even though the survey implies it, so their
policies are plain column comparisons. `answers` has no tenant column; its policy reads the
tenant through `responses`.

### 1.3 Constraints

The concepts give the two index names below verbatim and describe the other constraints without
names. The names here are the canonical ones the schema must use, derived mechanically from
Drizzle's own conventions (`uniqueKeyName` is `<table>_<columns>_unique`, a foreign key default is
`<table>_<columns>_<foreign table>_<foreign columns>_fk`, a check is named by the caller, and an
unnamed primary key becomes `<table>_pkey` in PostgreSQL).

```sql
-- organisations
PRIMARY KEY (id)                                  -- organisations_pkey
CONSTRAINT organisations_name_unique UNIQUE (name)

-- users
PRIMARY KEY (id)                                  -- users_pkey
CONSTRAINT users_organisation_id_id_unique UNIQUE (organisation_id, id)
CONSTRAINT users_organisation_id_organisations_id_fk
  FOREIGN KEY (organisation_id) REFERENCES organisations(id)
CONSTRAINT users_role_check CHECK (role IN ('manager', 'member'))
CONSTRAINT users_deactivated_at_check
  CHECK (deactivated_at IS NULL OR deactivated_at >= joined_at)
CONSTRAINT users_joined_at_check CHECK (joined_at <= created_at)

-- sessions
PRIMARY KEY (id)                                  -- sessions_pkey
CONSTRAINT sessions_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
CONSTRAINT sessions_expires_at_check CHECK (expires_at > created_at)
CONSTRAINT sessions_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$')

-- surveys
PRIMARY KEY (id)                                  -- surveys_pkey
CONSTRAINT surveys_organisation_id_id_unique UNIQUE (organisation_id, id)
CONSTRAINT surveys_organisation_id_organisations_id_fk
  FOREIGN KEY (organisation_id) REFERENCES organisations(id)
CONSTRAINT surveys_status_check CHECK (status IN ('active', 'archived'))

-- questions
PRIMARY KEY (id)                                  -- questions_pkey
CONSTRAINT questions_survey_id_id_unique UNIQUE (survey_id, id)
CONSTRAINT questions_organisation_id_survey_id_surveys_organisation_id_id_fk
  FOREIGN KEY (organisation_id, survey_id) REFERENCES surveys(organisation_id, id)
CONSTRAINT questions_survey_id_position_unique UNIQUE (survey_id, position)
CONSTRAINT questions_position_check CHECK (position BETWEEN 1 AND 3)
CONSTRAINT questions_type_check CHECK (type IN ('rating', 'yes_no'))

-- responses
PRIMARY KEY (id)                                  -- responses_pkey
CONSTRAINT responses_survey_id_id_unique UNIQUE (survey_id, id)
CONSTRAINT responses_organisation_id_survey_id_surveys_organisation_id_id_fk
  FOREIGN KEY (organisation_id, survey_id) REFERENCES surveys(organisation_id, id)
CONSTRAINT responses_organisation_id_user_id_users_organisation_id_id_fk
  FOREIGN KEY (organisation_id, user_id) REFERENCES users(organisation_id, id)
CONSTRAINT responses_survey_id_user_id_week_start_unique
  UNIQUE (survey_id, user_id, week_start)          -- one response per member per survey per week

-- answers
PRIMARY KEY (id)                                  -- answers_pkey
CONSTRAINT answers_survey_id_question_id_questions_survey_id_id_fk
  FOREIGN KEY (survey_id, question_id) REFERENCES questions(survey_id, id)
CONSTRAINT answers_survey_id_response_id_responses_survey_id_id_fk
  FOREIGN KEY (survey_id, response_id) REFERENCES responses(survey_id, id)
CONSTRAINT answers_response_id_question_id_unique UNIQUE (response_id, question_id)
CONSTRAINT answers_one_value_check
  CHECK (num_nonnulls(rating_value, yes_no_value) = 1)
CONSTRAINT answers_rating_value_check
  CHECK (rating_value IS NULL OR rating_value BETWEEN 1 AND 5)
```

### 1.4 Indexes

```sql
CREATE UNIQUE INDEX sessions_token_hash_key    ON sessions (token_hash);
CREATE UNIQUE INDEX surveys_one_active_per_org ON surveys (organisation_id) WHERE status = 'active';
CREATE INDEX users_organisation_idx     ON users (organisation_id);
CREATE INDEX sessions_user_idx          ON sessions (user_id);
CREATE INDEX sessions_expires_idx       ON sessions (expires_at);
CREATE INDEX responses_org_week_idx     ON responses (organisation_id, week_start);
CREATE INDEX responses_survey_week_idx  ON responses (survey_id, week_start);
CREATE INDEX answers_response_idx       ON answers (response_id);
```

`surveys_one_active_per_org` is what makes a second active survey a `409`.

### 1.5 Row-level security

Each table is declared with `.enableRLS()` (the pin's method name, not `withRLS`). Every policy is
`as: 'permissive'` and names `to: pulseApp` explicitly; omitting `to` would target the `public`
pseudo-role, so every role including `PUBLIC`.

The four fragments live once in `apps/api/src/db/tenant-settings.ts`:

```ts
appOrg          = sql`nullif(current_setting('app.current_org', true), '')::uuid`      // uuid, the cast is required
appUser         = sql`nullif(current_setting('app.current_user', true), '')::uuid`     // uuid
appRole         = sql`current_setting('app.current_role', true)`                      // text
appSessionToken = sql`current_setting('app.current_session_token', true)`             // text, SHA-256 hex
```

`set_config(name, value, true)` is called with `is_local = true`, so the settings die with the
transaction. A missing setting is `NULL`. A `set_config(name, value, true)` that ends in a rollback
leaves the setting as the empty string on a reused pooled connection, so the two uuid fragments wrap
`current_setting(...)` in `nullif(..., '')` before the cast: both `NULL` and `''` become `NULL`, the
cast of `NULL` is `NULL`, and a permissive policy fails closed instead of raising SQLSTATE 22P02.

| # | Table | Policy name | For | Predicate (`using`, and `withCheck` where the command writes) |
| --- | --- | --- | --- | --- |
| 1 | `organisations` | `organisations_select_own` | select | `id = appOrg` |
| 2 | `users` | `users_select_self_or_org` | select | `id = appUser OR (organisation_id = appOrg AND appRole = 'manager')` |
| 3 | `sessions` | `sessions_select_own_token` | select | `token_hash = appSessionToken` |
| 4 | `sessions` | `sessions_delete_own_token` | delete | `token_hash = appSessionToken` |
| 5 | `surveys` | `surveys_select_org` | select | `organisation_id = appOrg` |
| 6 | `surveys` | `surveys_insert_manager` | insert | `organisation_id = appOrg AND appRole = 'manager'` |
| 7 | `surveys` | `surveys_update_manager` | update | `organisation_id = appOrg AND appRole = 'manager'` (both halves) |
| 8 | `questions` | `questions_select_org` | select | `organisation_id = appOrg` |
| 9 | `questions` | `questions_insert_manager` | insert | `organisation_id = appOrg AND appRole = 'manager'` |
| 10 | `responses` | `responses_select_org` | select | `organisation_id = appOrg AND (appRole = 'manager' OR user_id = appUser)` |
| 11 | `responses` | `responses_insert_own` | insert | `organisation_id = appOrg AND user_id = appUser` (`withCheck` only) |
| 12 | `answers` | `answers_select_org` | select | `EXISTS (SELECT 1 FROM responses r WHERE r.id = answers.response_id AND r.organisation_id = appOrg AND (appRole = 'manager' OR r.user_id = appUser))` |
| 13 | `answers` | `answers_insert_own` | insert | `EXISTS (SELECT 1 FROM responses r WHERE r.id = answers.response_id AND r.organisation_id = appOrg AND r.user_id = appUser)` (`withCheck` only) |

`sessions` has no `INSERT` or `UPDATE` policy: session creation is `dev.create_session(...)`,
which runs as its owner and bypasses RLS. Policy 2's `id = appUser` branch is what lets the guard
read its own user row before the organisation is known.

Per request there are two transactions: the guard's auth transaction (set `app.current_session_token`,
read one `sessions` row, set `app.current_user`, read one `users` row, commit) and the interceptor's
request transaction (set all four settings, run the handler, commit or roll back). Guards run before
interceptors in Nest, which is why the two cannot be one transaction. Every service and repository
takes the transaction handle from `@CurrentTx()` as a required argument; a query on the pool is a
defect, because it runs with no settings: the policies fail closed and it sees no rows at all.

### 1.6 Grants and the dev schema

drizzle-kit generates no `GRANT`, so the grants are hand-written SQL in a
`drizzle-kit generate --custom` migration. Verbatim:

```text
USAGE on schemas public, dev
SELECT on organisations, users
SELECT, DELETE on sessions
SELECT, INSERT, UPDATE on surveys
SELECT, INSERT on questions, responses, answers
EXECUTE on dev.list_users() and dev.create_session(uuid, text, timestamptz)
```

No `UPDATE` on `responses` or `answers` (no edit path) and no `DELETE` outside `sessions`.

`0002_dev_schema` creates `CREATE SCHEMA dev` and two `SECURITY DEFINER` functions owned by
`pulse_owner`, written with `SET search_path = pg_catalog, pg_temp` and fully qualified names,
revoked from `PUBLIC` before the grant:

- `dev.list_users()` returns the fields the picker needs: user `id`, user `name`, `role`,
  organisation `id`, organisation `name`. It is the deliberate cross-tenant read, granted only
  when the dev flag is on.
- `dev.create_session(p_user_id uuid, p_token_hash text, p_expires_at timestamptz)` returns the
  new session `id` (`uuid`), refuses a user that does not exist or is deactivated, and deletes
  that user's expired sessions first.

### 1.7 Migrations

Applied as `pulse_owner` with `drizzle-kit migrate` and `DATABASE_URL_OWNER`. Order:

| File | Kind | Contents |
| --- | --- | --- |
| `0000_init` | generated from the schema | tables, constraints, indexes, `enableRLS()`, the eight policies |
| `0001_grants` | custom | schema `USAGE` and the DML grants |
| `0002_dev_schema` | custom | `CREATE SCHEMA dev`, the two functions and their grants |
| `0003_tenant_settings_nullif` | generated from the schema | rewrites the eight policies so the two uuid fragments wrap `current_setting(..., true)` in `nullif(..., '')`, because a rolled-back transaction-local `set_config` leaves an empty string rather than NULL on a reused connection |
| `0004_revoke_dev_grants` | custom | revokes the `dev` schema and function grants that 0002 made, because migrations also run in production; the seed grants them back on development databases |
| `0005_responses_insert_own` | generated from the schema | splits the `responses` and `answers` policies into a read policy and an own-row insert policy, so a Manager cannot file a response for another user |
| `0006_surveys_manager_writes` | generated from the schema | splits the `surveys` and `questions` policies into a read policy and Manager-only write policies, so a Member session cannot create or change a survey; thirteen policies from here on |

`drizzle-kit push` is banned against this database: it can emit
`ALTER TABLE ... DISABLE ROW LEVEL SECURITY` and drop policies it does not know about. Never edit
an applied migration; put new SQL in a new `--custom` file. drizzle-kit records applied
migrations in `drizzle.__drizzle_migrations`, which is why the e2e global setup drops the
`drizzle` schema too.

### 1.8 The week function

`apps/api/src/surveys/week.ts` is the only place a week is computed:

- `weekStartOf(instant)`: the SQL fragment `date_trunc('week', <instant> at time zone 'utc')::date`.
- `isWeekStart(dateString)`: a pure Monday check, used to validate the summary query.
- `weekLabel(start)`: a pure format of a stored date string into `Mon 21 Sep to Sun 27 Sep`.

A `Week` value is `{ start, end, label }`, where `start` is the Monday `YYYY-MM-DD`, `end` is
`start` plus 6 days (the Sunday), and `label` is `weekLabel(start)`.

### 1.9 Seed

`apps/api/src/db/seed.ts` exports `runSeed(ownerDb)` over the fixed ids in `fixtures.ts`. It runs as
`pulse_owner`, computes the current week with the same module, and is safe to re-run: every insert
uses `onConflictDoNothing` on a natural key.

- Two organisations: `Acme Manufacturing` and `Blue River Health`.
- Each has two Managers and five Members: one Member joined 30 days ago, one joined mid-week, one
  deactivated the day before the current week starts, one deactivated mid-week, and one joined 30
  days ago with no response (`memberNotAnswered`). The two deactivated Members are the denominator
  cases, computed from `weekStartOf(now())`, never hard-coded. `memberNotAnswered` exists so a demo
  of either organisation has a Member who can sign in and submit.
- Each has one active survey with three questions (rating, yes/no, rating). Blue River also has an
  archived survey, so the active filter has something to exclude.
- Acme has two responses in the current week and Blue River one, so both summaries are non-empty
  and differ. The zero-response case belongs to the tests.
- The seeded Acme week is the worked example in section 2.4: 2 completed, 4 eligible, rate 0.5. It is also the evidence for the ruling in section 5, point 1.

## 2. HTTP API

### 2.1 Global pipeline

- `app.setGlobalPrefix('api')`, so every path below is prefixed with `/api`.
- Authentication is default deny. Only `@Public()` routes work without a session: `GET /api/health`,
  `GET /api/me` and the two dev routes.
- `APP_GUARD` (auth, then roles), `APP_PIPE` (`StandardSchemaValidationPipe`) and `APP_FILTER` (one
  exception filter) are registered as providers in `app.module.ts`, never in `main.ts`, so the e2e
  suite runs the same pipeline as the server.
- Request schemas are Zod schemas attached per parameter: `@Body({ schema })`, `@Query({ schema })`.
  Unknown keys are stripped, so an `organisationId`, `userId`, `role` or `week_start` in a body is
  never read.
- One filter produces every error, including validation failures.

### 2.2 Endpoints

| # | Method | Path | Role | Request | Success |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/api/health` | anyone (`@Public()`) | - | `200 { "status": "ok" }` |
| 2 | GET | `/api/me` | anyone (`@Public()`) | - | `200 SessionState`, a null principal when signed out |
| 3 | GET | `/api/dev/users` | anyone, dev only | - | `200 { "users": DevUser[] }` |
| 4 | POST | `/api/dev/sessions` | anyone, dev only | `{ "userId": "<uuid>" }` | `201 SessionState` and the session cookie |
| 5 | DELETE | `/api/sessions` | any authenticated role | - | `204`, the row is deleted and the cookie cleared |
| 6 | GET | `/api/surveys/active` | Member | - | `200 { survey, week, hasRespondedThisWeek }` |
| 7 | GET | `/api/surveys` | Manager | - | `200 { "surveys": SurveyListItem[] }` |
| 8 | POST | `/api/surveys` | Manager | `CreateSurvey` | `201 { "survey": SurveyDetail }` |
| 9 | PATCH | `/api/surveys/:id` | Manager | `{ "status": "active" \| "archived" }` | `200 { "survey": SurveyListItem }` |
| 10 | POST | `/api/surveys/:id/responses` | Member | `{ "answers": AnswerInput[] }` | `201 { "response": { "id", "week" } }` |
| 11 | GET | `/api/surveys/:id/summary` | Manager | `?weekStart=YYYY-MM-DD` (optional) | `200 Summary` |

Notes that change behaviour:

- 3 and 4 are `404` when `AUTH_MODE=off`. 4 is also `404` for an unknown user id or a deactivated
  user, never `400`.
- 2 is the bootstrap route. It is the only route that answers with a null principal, so the client
  can tell "not signed in, dev sign-in available" from "not signed in, sign-in is disabled here".
- 6 returns `survey: null` with the current week and `hasRespondedThisWeek: false` when the
  organisation has no active survey, so the Member screen has one empty state and no error path.
  `survey` is a `SurveyDetail`, because the form needs the questions.
- 9 accepts both statuses. `active` on an archived survey succeeds unless it would create a second
  active survey, which is `409`. The endpoint exists to archive; there is no title or question edit.
- 10 is all or nothing in one transaction. `week_start` comes from `weekStartOf(now())`, `survey_id`
  and `question_id` come from the survey and the session, and `response_id` from the inserted
  response row; none of them come from the body. A duplicate week is `409` (the unique constraint),
  an archived survey is `409`.
- 11 defaults `weekStart` to the current week. The value is a lookup key for a stored column, never
  a boundary: the server validates it as a Monday. A non-Monday or malformed value is `400`.
- Another organisation's id is `404`, never `403`, on 9, 10 and 11, so existence does not leak.

### 2.3 Request schemas

| Schema | Rules |
| --- | --- |
| `CreateSurvey` | `title`: trimmed string, 1 to 120 characters. `questions`: array of 1 to 3. Each item: `type` in `'rating'` or `'yes_no'`; `prompt`: trimmed string, 1 to 200 characters. No `position` in the body: it is assigned 1, 2, 3 from the array order. |
| `PatchSurvey` | `status` in `'active'` or `'archived'`. |
| `SubmitResponse` | `answers`: exactly one entry per question of the survey, no extras. Each item: `questionId` (a uuid of that survey) plus exactly one of `rating` (integer 1 to 5) or `yesNo` (boolean), matching the question's `type`. |
| `DevSession` | `userId`: uuid. |
| summary query | `weekStart` optional, `YYYY-MM-DD`, and a Monday (`isWeekStart`), else `400`. |

### 2.4 Response shapes

Field names are exact. `|` marks a union.

```jsonc
// SessionState, signed in
{ "signedIn": true,
  "user":         { "id": "<uuid>", "name": "string" },
  "organisation": { "id": "<uuid>", "name": "string" },
  "role": "member" | "manager",
  "devSignIn": true | false }

// SessionState, signed out: signedIn false and three nulls
{ "signedIn": false, "user": null, "organisation": null, "role": null, "devSignIn": true | false }

// DevUser
{ "id": "<uuid>", "name": "string", "role": "member" | "manager",
  "organisation": { "id": "<uuid>", "name": "string" } }

// Week
{ "start": "2026-09-21", "end": "2026-09-27", "label": "Mon 21 Sep to Sun 27 Sep" }

// SurveyDetail
{ "id": "<uuid>", "title": "string", "status": "active" | "archived",
  "questions": [ { "id": "<uuid>", "position": 1, "type": "rating" | "yes_no", "prompt": "string" } ] }

// SurveyListItem
{ "id": "<uuid>", "title": "string", "status": "active" | "archived",
  "questionCount": 3, "weekStart": "2026-09-21" }

// GET /api/surveys/active
{ "survey": SurveyDetail | null, "week": Week, "hasRespondedThisWeek": true | false }

// POST /api/surveys/:id/responses, 201
{ "response": { "id": "<uuid>", "week": Week } }

// Summary
{ "survey": { "id": "<uuid>", "title": "string", "status": "active" | "archived" },
  "week": Week,
  "completion": { "completed": 2, "eligible": 4, "rate": 0.5 | null },
  "questions": [
    { "id": "<uuid>", "position": 1, "type": "rating",  "prompt": "string",
      "average": 4.5 | null, "count": 2 },
    { "id": "<uuid>", "position": 2, "type": "yes_no",  "prompt": "string",
      "yes": 1, "no": 1 }
  ] }
```

`rate` is a fraction, never a percentage and never clamped. It is `null` when `eligible` is 0, and
a test asserts it never exceeds 1. A rating question with no answers carries `"average": null,
"count": 0`. A yes/no question with no answers carries `"yes": 0, "no": 0`. Both are numbers, never
`NaN`. The API never renders text for these; the front end does.

Summary maths, the only counting and dividing in the project
(`apps/api/src/surveys/summary.math.ts`):

```text
eligible  = count(users where organisation_id = <the session's organisation>
                  and ((role = 'member'
                        and joined_at < week_start + interval '7 days'
                        and (deactivated_at is null or deactivated_at >= week_start))
                       or <the user responded to this survey in this week>))
completed = count(responses where survey_id = <the survey> and week_start = <the week>)
rate      = eligible = 0 ? null : completed / eligible
rating    = count = 0 ? { average: null, count: 0 } : { average: avg(rating_value), count }
yes/no    = { yes: count(yes_no_value = true), no: count(yes_no_value = false) }
```

The window is half-open (`joined_at < week_start + 7 days`) so the last microsecond of Sunday is
not lost. `avg()` returns `SQL<string | null>` at this pin, because PostgreSQL returns numerics as
text, so the service converts and null-checks before the maths; `count()` is already a number.
See section 5 for the `role = 'member'` ruling.

### 2.5 Error contract

One filter produces every error body, for validation failures and thrown exceptions alike:

```json
{ "statusCode": 400, "error": "Bad Request",
  "message": ["title: Too big: expected string to have <=120 characters"],
  "path": "/api/surveys", "timestamp": "2026-09-26T10:00:00.000Z" }
```

`message` is always an array of strings. `timestamp` is ISO 8601.

| Status | When |
| --- | --- |
| `400` | validation failure, a malformed or non-Monday `weekStart`, an answer whose type does not match its question |
| `401` | no session, a tampered token, an expired session, or a session whose user has been deactivated, on a protected route |
| `403` | a role refusal: a Manager route called with a Member session, or the reverse |
| `404` | an unknown id, a resource in another organisation, or a dev route with `AUTH_MODE=off` |
| `409` | a duplicate submit for the week, a submit to an archived survey, a second active survey |
| `500` | anything unexpected, logged with the request path, no internals in the body |

A duplicate submit never raises: `ON CONFLICT DO NOTHING` on
`responses_survey_id_user_id_week_start_unique` returns no row and the service answers `409`. A
PostgreSQL unique violation (`23505`) on `surveys_one_active_per_org` is caught by the surveys
service where it is raised and rethrown as `409`. The global exception filter maps no database
error, so any other database error stays a `500`.

### 2.6 Sessions

- The token is 256 random bits, base64url in the cookie. The database stores only its SHA-256 hex
  hash. The cookie is not signed: it carries an opaque lookup key and the database comparison is
  the check.
- Cookie options: `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge: SESSION_TTL_HOURS * 3600`
  (Nest's `maxAge` is in **seconds**), and `secure` outside local development.
- The guard parses the `Cookie` header by hand. `cookie-parser` is not a dependency and must not be
  added.
- The guard hashes the presented token and treats `expires_at <= now()` or a user with
  `deactivated_at <= now()` as no session. It deletes the row in the same transaction, on public
  and protected routes alike.
- `DELETE /api/sessions` deletes the row, not only the cookie, and clears the cookie. It needs
  `app.current_session_token` set on the request transaction, because the settings are
  transaction-local and the delete predicate would otherwise match nothing.
- Session creation happens only on `POST /api/dev/sessions`. There is no production sign-in in this
  slice.

## 3. Front end consumption

`apps/web` is a client-only SPA. Vite proxies `/api` to the API, so every call is same-origin, the
cookie is first-party and no CORS is configured. The shapes in section 2.4 are Zod schemas in the
shared `@pulse/contracts` package ([ADR-0008](/adr/0008-shared-contracts-package.md)), and
`src/api/parsers.ts` parses each payload once with them, so a malformed payload fails at the app
edge instead of becoming `undefined` in a render.
The client never divides and never sends an organisation id.

### 3.1 The field names the client reads

| Payload | Fields the client reads |
| --- | --- |
| `SessionState` | `signedIn`, `user.id`, `user.name`, `organisation.id`, `organisation.name`, `role`, `devSignIn` |
| `DevUser` | `id`, `name`, `role`, `organisation.id`, `organisation.name` |
| `Week` | `start`, `end`, `label` |
| `SurveyDetail` | `id`, `title`, `status`, `questions[].id`, `questions[].position`, `questions[].type`, `questions[].prompt` |
| `SurveyListItem` | `id`, `title`, `status`, `questionCount`, `weekStart` |
| active payload | `survey` (or `null`), `week`, `hasRespondedThisWeek` |
| summary | `survey.id`, `survey.title`, `survey.status`, `week`, `completion.completed`, `completion.eligible`, `completion.rate`, `questions[].id`, `questions[].position`, `questions[].type`, `questions[].prompt`, and per type `questions[].average` plus `questions[].count` (rating) or `questions[].yes` plus `questions[].no` (yes/no) |
| submit result | `response.id`, `response.week` |

### 3.2 The five screen states

`App` derives exactly one of these in render, from the session state and nothing else. There is no
router and no URL for a screen.

| State | Screen | Behaviour |
| --- | --- | --- |
| bootstrap | `App` | `GET /api/me` on mount, with an abort or ignore cleanup, because StrictMode double-invokes effects |
| signed out, `devSignIn: true` | `SignInScreen` | `GET /api/dev/users`, users grouped by organisation with a role badge; picking one posts `/api/dev/sessions` |
| signed out, `devSignIn: false` | `SignInScreen` (disabled) | renders "Sign-in is disabled in this environment", because `/api/dev/users` is `404` |
| `role: 'member'` | `MemberScreen` | the active survey, the server's week label, one field per question, submit, and an empty state when `survey` is `null` |
| `role: 'manager'` | `ManagerScreen` | the survey list, then the summary for the selected survey |

The Member form uses `<form action={submitAction}>` with `useActionState` and `useFormStatus`, and
the action returns `{ kind: 'submitted' | 'duplicate' | 'invalid' | 'error', message?: string }`.
A `409` renders "You have already answered this week" next to the form, a `400` renders the
message, and a network failure renders a retry. The form stays enabled even when the API says the
Member already answered: the database decides and the `409` path stays visible.

### 3.3 Null rendering

| API value | The client renders |
| --- | --- |
| `completion.rate === null` | "no eligible members", never `0`, never `NaN` |
| `questions[].average === null` | "no answers yet", never `0`, never `NaN` |
| `rate` present | a percentage: the fraction times 100, formatted for a person |
| `survey === null` on the active payload | the Member empty state |
| a `403` or `404` from the API | shown honestly, not swallowed |

`ErrorBoundary` wraps the tree. API failures are values, not throws, so only a programming error
reaches the boundary. Role checks in the UI are cosmetic.

## 4. Environment and scripts

### 4.1 Environment variables

`.env` lives at the repository root; `.env.example` is the template. `drizzle.config.ts` and
`src/config.ts` load the repo-root `.env` themselves with `process.loadEnvFile` and tolerate its
absence, because drizzle-kit's own `dotenv/config` loads `.env` from the cwd (`apps/api` under a
workspace script).

| Variable | Default | Read by | Notes |
| --- | --- | --- | --- |
| `POSTGRES_USER` | `pulse` | Compose | container user |
| `POSTGRES_PASSWORD` | `pulse` | Compose, `db:bootstrap` | local development value, not a secret; passed to psql as `owner_password` and `app_password` |
| `POSTGRES_DB` | `pulse` | Compose | development database |
| `POSTGRES_PORT` | `5432` | Compose | published on `127.0.0.1` only |
| `DATABASE_URL_OWNER` | - | drizzle-kit, the seed | `postgres://pulse_owner:pulse@127.0.0.1:5432/pulse` |
| `DATABASE_URL_APP` | - | the API | `postgres://pulse_app:pulse@127.0.0.1:5432/pulse`; must differ from the owner URL |
| `TEST_DATABASE_URL_OWNER` | - | the e2e global setup | `pulse_test`, migrations and seed |
| `TEST_DATABASE_URL_APP` | - | the RLS and isolation suites | `pulse_test` as `pulse_app` |
| `AUTH_MODE` | `off` | the API | `off` or `dev`. `off` makes the two dev routes `404`. `dev` enables the picker and is refused unless `NODE_ENV` is `development` or `test` |
| `SESSION_TTL_HOURS` | `12` | the API | session lifetime; cookie `maxAge` is this times 3600 seconds |
| `API_PORT` | `3000` | the API, Vite | the API listens here and Vite proxies `/api` to `http://127.0.0.1:$API_PORT` |
| `NODE_ENV` | - | the API | only `development` and `test` count as development; any other value, or none, is production: `AUTH_MODE=dev` is refused and the cookie is `secure` |

### 4.2 Root npm scripts

Copied verbatim from `package.json` at the root:

```text
dev:api        npm run start:dev -w apps/api
dev:web        npm run dev -w apps/web
build          npm run build -w apps/api && npm run build -w apps/web
test           npm run db:up && npm run db:bootstrap && npm run test -w apps/api && npm run test -w apps/web
test:e2e       npm run db:up && npm run db:bootstrap && npm run test:e2e -w apps/api
test:e2e:web   npm run db:reset && playwright test --config apps/web/e2e/playwright.config.ts
lint           npm run lint -w apps/api && npm run lint -w apps/web
typecheck      npm run typecheck -w apps/api && npm run typecheck -w apps/web
db:up          docker compose up -d --wait db
db:down        docker compose down
db:bootstrap   docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v owner_password="$POSTGRES_PASSWORD" -v app_password="$POSTGRES_PASSWORD"' < apps/api/db/bootstrap.sql
db:generate    npm run db:generate -w apps/api          # drizzle-kit generate
db:migrate     npm run db:migrate -w apps/api           # drizzle-kit migrate
db:seed        npm run db:seed -w apps/api              # tsx src/db/seed-cli.ts
db:reset       docker compose down -v && npm run db:up && npm run db:bootstrap && npm run db:migrate && npm run db:seed
db:psql        docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
okf:validate   node scripts/okf-view.mjs okf --validate
okf:view       node scripts/okf-view.mjs okf
okf:mermaid    node scripts/okf-mermaid.mjs okf
okf:mermaid:render  node scripts/okf-view.mjs okf --check-render
react:index    node scripts/react-docs-index.mjs
```

### 4.3 Traps already known

- drizzle-kit imports `dotenv/config`, which loads `.env` from the cwd (`apps/api` under a workspace
  script), so `drizzle.config.ts` and `src/config.ts` must load the repo-root `.env` themselves with
  `process.loadEnvFile` and tolerate its absence.
- `drizzle-kit push` is banned. Never edit an applied migration.
- `test/rls.spec.ts` is an integration test included by the unit Vitest config, so the
  test-database global setup is wired into both `vitest.config.ts` and `vitest.config.e2e.ts`. The
  global setup drops and recreates `public`, `dev` and `drizzle` in `pulse_test`, then migrates and
  seeds. Dropping `drizzle` matters, or the second run's `migrate` is a no-op against an empty
  database.
- The cookie is read by parsing the `Cookie` header by hand. `cookie-parser` is not a dependency and
  must not be added. Nest's cookie `maxAge` is in seconds.
- The API is ESM (`"type": "module"`, `moduleResolution: nodenext`), so relative imports carry the
  `.js` extension.

## 5. Contract rulings and open points

Six places where the concepts are silent or disagree. The ruling is binding on later slices; the
concept should be corrected to match.

1. **`eligible` counts Members only (concept defect).** `api.md` writes
   `count(users in the organisation where joined_at < week_start + interval '7 days' and ...)` with
   no role filter, but its own worked example (`completed: 2, eligible: 3, rate: 0.6666666666666666`)
   was the seeded Acme week: Acme had four Members, one of them deactivated before the week starts,
   so three were eligible, and the two seeded Managers would have made it five. (Since the seed
   gained `memberNotAnswered`, the Acme week is 2 of 4; the argument is unchanged.) Requirement 4.1.6 says the
   rate is "responses compared to the number of members in that organisation", the spec and the
   summary test plan both say "members", and only a Member can submit. The contract pins
   `role = 'member'`. Fix the formula in `api.md`.
2. **`SurveyListItem.weekStart` has no stored source (gap).** `surveys` has no week column and
   `GET /api/surveys` takes no query parameter, so the only week the list can carry is the current
   one. Pin: `weekStart` is `weekStartOf(now())` as `YYYY-MM-DD`, the same value the summary
   defaults to. It exists so the Manager screen can pass the week it is showing.
3. **`GET /api/me` is `@Public()` and still reports a session (gap).** Pin: the guard always tries to
   resolve a session when the request carries the session cookie. `@Public()` only suppresses the
   `401`, so a public route with no valid session sees a null principal. A missing, expired or
   revoked session is never a `401` on a public route. On every other route it is.
4. **The session cookie has no name in the concepts (gap).** No client code reads it (it is
   `httpOnly`) and Playwright uses the browser context, so the name is internal to the API slice and
   its e2e tests. The API slice picks one name, uses it for `setCookie` and for the hand-parsed
   `Cookie` header, and keeps it in one place. Nothing else depends on it. The name is
   `pulse_session`, defined once in `apps/api/src/auth/sessions.service.ts` (ruled 2026-09-26).
5. **`GET /api/surveys` returns every survey of the organisation (gap).** The concepts do not say
   whether the list filters by status. Pin: both statuses, newest first (`created_at` desc, then
   `id`). `SurveyListItem.status` exists so the client can tell them apart, the Manager screen
   selects a survey from the list to read its summary, the summary endpoint accepts an archived
   survey, and the seeded archived Blue River survey otherwise has nothing to show. Only
   `GET /api/surveys/active`, not the list, filters on `status` (ruled 2026-09-26).
6. **The Member submit journey uses a Blue River Member, and the Manager read journey runs first
   (concept defect, ruled 2026-09-26).** `frontend.md` step 1 says "Pick an Acme Member, answer the
   survey, submit", but the seed cannot support it on any day of the week. Acme's only two
   sign-in-able Members already have a response this week (`memberLongAgo` at `fixtures.ts:93`,
   response at `:135`; `memberMidWeek` at `:94`, response at `:145`). The other two Acme Members
   carry a non-null `deactivated_at` (`:95-102`), and `dev.list_users()` hides them
   (`WHERE u.deactivated_at IS NULL`) while `dev.create_session` refuses them (it raises `P0002` when
   `deactivated_at` is not null, so a `404`, not "not yet deactivated"). Blue River's only seeded
   response is `b1000000-0000-4000-8000-000000000003` (`fixtures.ts:227`), so `Blue River Member Mid
   Week` (`b1000000-0000-4000-8000-000000000004`, `:161`) is the only seeded Member who can sign in
   and has not answered this week. The ruling: the Playwright submit journey signs in as
   **Blue River Member Mid Week**, and the Manager summary journey runs **before** it, because that
   submit turns Blue River from 1 of 3 completed to 2 of 3 and would erase the "the titles and
   numbers differ" proof the demo exists to give. The seed is not changed: section 1.9 and the Acme
   worked example (2 completed, 3 eligible, rate `0.6666666666666666`) are pinned, and adding a
   Member who has not answered would change `eligible` from 3 to 4.
   **Amended 2026-09-26:** the human asked for one Member per organisation with no answers, so
   the demo has someone to sign in as and submit. The seed now adds `memberNotAnswered` to both
   organisations, and the pinned numbers moved: Acme 2 of 4 (rate 0.5), Blue River 1 of 4 (rate
   0.25). The Playwright journeys keep this ruling's order and Member, with the new numbers.

Two nits, pinned so they do not drift:

- The error example in `api.md` shows `"title must be shorter than 120 characters"`, while the
  pipe's default factory prefixes the issue path (`title: ...`). `message` is always a `string[]`;
  the prefix is the pipe's behaviour and the example is illustrative.
- `frontend.md` hardcodes the Vite proxy target as `http://127.0.0.1:3000`, while `.env.example`
  parameterises it as `$API_PORT`. The contract pins `http://127.0.0.1:$API_PORT`, which is the
  same value at the default.

## 6. Pinned source

Framework behaviour above comes from these files in the read-only submodules, and from the local
skills that map them. Read the file before writing the code that depends on it.

| What it pins | Path |
| --- | --- |
| `pgPolicy(name, { as, for, to, using, withCheck })` | `references/drizzle-orm/drizzle-orm/src/pg-core/policies.ts` |
| `.enableRLS()` on a table (not `withRLS`) | `references/drizzle-orm/drizzle-orm/src/pg-core/table.ts` |
| `pgRole(name).existing()` | `references/drizzle-orm/drizzle-orm/src/pg-core/roles.ts` |
| `uuid().defaultRandom()` | `references/drizzle-orm/drizzle-orm/src/pg-core/columns/uuid.ts` |
| `date` in the default string mode | `references/drizzle-orm/drizzle-orm/src/pg-core/columns/date.ts` |
| `unique` and the default constraint name | `references/drizzle-orm/drizzle-orm/src/pg-core/unique-constraint.ts` |
| `index` and `uniqueIndex` | `references/drizzle-orm/drizzle-orm/src/pg-core/indexes.ts` |
| `check(name, sql)` | `references/drizzle-orm/drizzle-orm/src/pg-core/checks.ts` |
| `foreignKey({ name?, columns, foreignColumns })` and its default name | `references/drizzle-orm/drizzle-orm/src/pg-core/foreign-keys.ts` |
| `onConflictDoNothing` and `returning` | `references/drizzle-orm/drizzle-orm/src/pg-core/query-builders/insert.ts` |
| `count()` is a number, `avg()` is `SQL<string \| null>` | `references/drizzle-orm/drizzle-orm/src/sql/functions/aggregate.ts` |
| an absent policy `to` serialises as `TO public` | `references/drizzle-orm/drizzle-kit/src/serializer/pgSerializer.ts` |
| `pgRole(...).existing()` emits no `CREATE ROLE` | `references/drizzle-orm/drizzle-kit/src/sqlgenerator.ts` |
| `--custom` migrations | `references/drizzle-orm/drizzle-kit/src/cli/schema.ts` |
| `drizzle.__drizzle_migrations` | `references/drizzle-orm/drizzle-kit/src/index.ts` |
| `StandardSchemaValidationPipe` reads `metadata.schema` and its default message list | `references/nest/packages/common/pipes/standard-schema-validation.pipe.ts` |
| `@Body({ schema })` on a handler parameter | `references/nest/sample/35-zod-validation/src/cats/cats.controller.ts` |
| cookie `maxAge` is in seconds | `references/nest/packages/common/interfaces/http/cookie-options.interface.ts` |
| `setCookie` and `clearCookie` in the tested shape | `references/nest/integration/cookies/e2e/cookies.spec.ts` |
| guards run before interceptors | `references/nest/packages/core/router/router-execution-context.ts` |
| `APP_GUARD`, `APP_PIPE`, `APP_FILTER` tokens | `references/nest/packages/core/constants.ts` |
| `webServer` `env` merges with `process.env`, `cwd` resolves against the config directory, and the reuse-existing error text | `node_modules/playwright/lib/runner/index.js:848,868-874` |
| a config in a `"type": "module"` package loads as ESM, and `rootDir` is the resolved `testDir` | `node_modules/playwright/lib/common/index.js:406,508` |
| `page.request` shares the browser context's cookies | `node_modules/playwright/node_modules/playwright-core/types/types.d.ts:5838` |

Local skills: `.pi/skills/drizzle-reference/SKILL.md`, `.pi/skills/nestjs-reference/SKILL.md`,
`.pi/skills/react-reference/SKILL.md` (client-only React 19.3: no Server Components, no server
rendering, no framework router, no data library).

Verification commands, from the definition of done in [Spec](/design/spec.md): `npm run db:reset`,
`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run test:e2e:web`,
`npm run okf:validate`.
