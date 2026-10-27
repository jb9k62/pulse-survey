---
type: Architecture
title: "Architecture: tenant isolation, layout and tests"
description: "The two database roles, the row-level security policies, the per-request tenant context, the repository layout and the test plan."
tags: [multi-tenancy, security, rls, nestjs, layout, testing]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: okf/design/spec.md
    title: The plan of record this concept was split out of
  - resource: okf/adr/0005-rls-with-a-non-owner-app-role.md
    title: The isolation decision this architecture implements
  - resource: okf/design/tenant-isolation-options.md
    title: What the pinned Drizzle and NestJS do for row-level security, and the testing trap
---

# Tenant isolation

**The organisation always comes from the authenticated user's server-side session. It never comes
from a request body, a query string or a route parameter.** The guard is the only code that derives
the organisation, the user id and the role, and it reads them from the `sessions` row.

## Roles

- `pulse_owner` owns the `public` schema and runs migrations and the seed; the API never uses it.
- `pulse_app` is the API role: `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, owns no table.

Both are declared as `pgRole('...').existing()` (`references/drizzle-orm/drizzle-orm/src/pg-core/roles.ts:33`),
so drizzle-kit never emits `CREATE ROLE` or a future `DROP ROLE`
(`references/drizzle-orm/drizzle-kit/src/sqlgenerator.ts:163-176`). `bootstrap.sql` is idempotent:
both roles, `ALTER DATABASE pulse OWNER TO pulse_owner`, and `pulse_test` owned by `pulse_owner`.
Local development passwords only, held in `.env`.

## The tenant context

Every request that touches the database runs in exactly one tenant transaction, and the application
sets the context on it:

```sql
SELECT set_config('app.current_org', $1, true), set_config('app.current_user', $2, true),
       set_config('app.current_role', $3, true), set_config('app.current_session_token', $4, true);
```

The third argument is `is_local = true`, so the settings die with the transaction and cannot leak
onto the next request that borrows the pooled connection. `set_config` and `current_setting` appear
nowhere in `drizzle-orm/src` or `drizzle-kit/src`, so this is raw SQL through `tx.execute(sql\`...\`)`.
`$4` is the SHA-256 hash of the cookie's token, taken from the guard's principal. It is set on the
request transaction as well as the auth transaction, because the settings are transaction-local and
the logout `DELETE` (policy 4 below) has to match there; without it the delete would silently affect
zero rows.

The fragments live once in `apps/api/src/db/tenant-settings.ts` and every policy reuses them:

```ts
appOrg          = sql`nullif(current_setting('app.current_org', true), '')::uuid`      // uuid
appUser         = sql`nullif(current_setting('app.current_user', true), '')::uuid`     // uuid
appRole         = sql`current_setting('app.current_role', true)`                      // text
appSessionToken = sql`current_setting('app.current_session_token', true)`             // text
```

The `::uuid` cast is required: `current_setting()` returns `text` and PostgreSQL has no
`uuid = text` operator, so a policy comparing a uuid column to the raw setting fails to create. A
missing setting is `NULL`, and a `set_config(name, value, true)` that rolls back leaves the setting
as the empty string on a reused pooled connection. The two uuid fragments therefore wrap
`current_setting(...)` in `nullif(..., '')`, so both `NULL` and `''` become `NULL`, every predicate
is `NULL`, and a permissive policy fails closed instead of raising SQLSTATE 22P02.

An authenticated request therefore uses two transactions:

1. **Auth transaction** (in the guard): set `app.current_session_token` from the cookie's hash, read
   one `sessions` row, set `app.current_user` from it, read one `users` row, then commit. The
   organisation and role come from that user row. An expired session, or a user with
   `deactivated_at <= now()`, is treated as no session: the guard deletes the row in the same
   transaction and answers `401`. That closes the hole where a Member deactivated on Sunday submits
   on Monday with a live cookie, which would let `completed` exceed `eligible` ([API surface](/pulse-surveys/api.md)).
2. **Request transaction** (in the interceptor): set all four settings, run the handler, commit on
   success and roll back on error.

Guards run before interceptors in Nest
(`references/nest/packages/core/router/router-execution-context.ts:178,200`), which is why the auth
read cannot share the request transaction. The interceptor puts the transaction handle on the
request and `@CurrentTx()` injects it, so every service and repository signature takes the handle
explicitly. A repository that reaches for the pool is a defect, not a style choice: a query on the
pool runs with no settings and sees every organisation.

Application-layer scoping stays as the second layer ([ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md)):
repositories are org-scoped by construction, each taking the organisation from the session as a
required argument, so the common case does not depend on the policy and the policy catches the query
that forgets.

## Policies

Declared with `pgPolicy(name, { as: 'permissive', for, to, using, withCheck })`
(`references/drizzle-orm/drizzle-orm/src/pg-core/policies.ts:16-20,54`), attached as the third
argument of `pgTable`, with `.enableRLS()` on each table
(`references/drizzle-orm/drizzle-orm/src/pg-core/table.ts:64,127`; at this pin the method is
`enableRLS`, not the `withRLS` the current docs show). Every policy names `to: pulseApp` explicitly:
omitting `to` defaults to the `public` pseudo-role, which targets every role including `PUBLIC`
(`references/drizzle-orm/drizzle-kit/src/serializer/pgSerializer.ts:492-493`).

| # | Table | Policy | For | Predicate (`using`, and `withCheck` where the command writes) |
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

Notes an implementer needs: policy 2's self-read branch lets the guard read its own user row before
the organisation is known; policies 6, 7 and 9 keep survey and question writes to a Manager in the database, not only in
the controller; policy 10 is the member-level read rule from
[ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md), and policy 11 stops anyone, Manager
included, inserting a response for someone else; policies 12 and 13 are written out rather than
relying on nested policy evaluation, and the subquery is itself subject to policy 10, so the
member narrowing applies twice;
and `sessions` has no `INSERT` or `UPDATE` policy, because session creation is the dev-only
`dev.create_session(...)` below, which runs as its owner and bypasses RLS. A session row is visible
only when its hash matches the token set for that transaction, so the table cannot be listed, and
logout deletes exactly the row the request authenticated with.

## Grants

drizzle-kit generates no `GRANT` at all, so the grants are hand-written SQL in a
`drizzle-kit generate --custom` migration (`references/drizzle-orm/drizzle-kit/src/cli/schema.ts:61-62`).

```text
USAGE on schemas public, dev
SELECT on organisations, users;  SELECT, DELETE on sessions;  SELECT, INSERT, UPDATE on surveys
SELECT, INSERT on questions, responses, answers
EXECUTE on dev.list_users() and dev.create_session(uuid, text, timestamptz)
```

No `UPDATE` on `responses` or `answers` (no edit path), and no `DELETE` outside `sessions`. Both
functions are `SECURITY DEFINER`, owned by `pulse_owner`, created with
`SET search_path = pg_catalog, pg_temp` and fully qualified names, and revoked from `PUBLIC` before
the grant. `dev.list_users()` is the deliberate cross-tenant read the picker needs.
`dev.create_session(p_user_id, p_token_hash, p_expires_at)` returns the new session id, refuses a
user that does not exist or is deactivated, and deletes that user's expired sessions first. `users`
stays org-scoped, so no ordinary request reads another organisation's users.

## Migration order, applied as `pulse_owner`

1. `0000_init`: tables, constraints, indexes, `enableRLS()`, policies (generated from the schema).
2. `0001_grants`: schema `USAGE` and the DML grants (custom).
3. `0002_dev_schema`: `CREATE SCHEMA dev`, the two functions and their grants (custom).
4. `0003_tenant_settings_nullif`: the eight policies rewritten with `nullif(..., '')` around the
   two uuid fragments, because a rolled-back transaction-local `set_config` leaves an empty string,
   not NULL, on a reused pooled connection (generated from the schema).
5. `0004_revoke_dev_grants`: revokes what 0002 granted on the `dev` schema, because migrations
   also run in production. The seed grants it back on development databases (custom).
6. `0005_responses_insert_own`: splits the `responses` and `answers` policies into a read policy
   and an own-row insert policy, so a Manager cannot file a response for another user (generated
   from the schema).
7. `0006_surveys_manager_writes`: splits the `surveys` and `questions` policies into a read
   policy and Manager-only write policies (generated from the schema).

Applied with `drizzle-kit migrate` using `DATABASE_URL_OWNER`. **`drizzle-kit push` is never run
against this database**: it can emit `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` and drop policies
it does not know about ([ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md), drizzle-orm issues
4948 and 4763). Never edit an applied migration; put new SQL in a new `--custom` file.

## Startup invariants

The API validates its configuration before it listens and refuses to start when any of these fails:

1. `DATABASE_URL_OWNER` and `DATABASE_URL_APP` are both set and are not equal.
2. The app connection's `current_user` is not `rolsuper` and not `rolbypassrls`.
3. The app connection's `current_user` owns no table in any schema, and is not a member of a role
   that is superuser, `BYPASSRLS` or owns a table (that role could be reached with `SET ROLE`).
   That is why no `FORCE ROW LEVEL SECURITY` is needed, and the check keeps it true.
4. `AUTH_MODE` is `off` or `dev`; `AUTH_MODE=dev` unless `NODE_ENV` is `development` or `test` is a startup failure, so a
   deployment that forgets `NODE_ENV` fails closed.
5. The app connection can call the dev sign-in functions exactly when `AUTH_MODE=dev`. Migration
   `0004` revokes the grants that `0002` made, and only `npm run db:seed` (and the test setup) grant
   them back, so a production database never lets `pulse_app` list users across organisations or
   create a session.

Accepted limits, recorded rather than hidden: referential integrity checks bypass RLS, `TRUNCATE` is
not subject to row security, and a superuser or `BYPASSRLS` role ignores policies entirely.

## Repository layout

```text
apps/api/
  db/bootstrap.sql                     roles, the two databases, run as the Compose superuser
  db/migrations/                       0000_init, 0001_grants, 0002_dev_schema, 0003_tenant_settings_nullif
  drizzle.config.ts                    schema, out, dialect, casing, DATABASE_URL_OWNER
  src/main.ts, src/config.ts           prefix and cookie support; env parsing and the startup invariants
  src/app.module.ts                    APP_GUARD x2, APP_PIPE, APP_FILTER, the feature modules
  src/config.module.ts                 the global APP_CONFIG provider
  src/app.controller.ts                GET /api/health
  src/db/schema.ts                     tables, constraints, indexes, pgRole(...).existing(), policies
  src/db/tenant-settings.ts            the app.current_* fragments, with the uuid casts
  src/db/db.module.ts                  the pulse_app pool and the Drizzle instance
  src/db/pg-errors.ts                  unwrap a pg error from Drizzle; match a unique violation
  src/db/fixtures.ts, seed.ts, seed-cli.ts
  src/auth/auth.module.ts, auth.guard.ts, roles.guard.ts, decorators.ts, sessions.service.ts,
             sessions.controller.ts (GET /api/me, DELETE /api/sessions)
  src/surveys/surveys.module.ts, week.ts, surveys.controller.ts, surveys.service.ts,
             surveys.repository.ts, summary.service.ts, summary.math.ts
  src/dev/dev.module.ts, dev.controller.ts, dev.service.ts   the two dev routes, 404 when AUTH_MODE is off
  src/common/tenant-transaction.interceptor.ts, http-exception.filter.ts
  test/                                see the test plan below
apps/web/
  src/main.tsx, src/App.tsx            createRoot in StrictMode; the five states, derived in render
  src/api/client.ts, parsers.ts        the one fetch wrapper; responses parsed with @pulse/contracts
  src/hooks/useApiResult.ts            fetch one API result per key, loading derived in render
  src/session/SessionProvider.tsx, session-context.ts   the only Context, and its hook
  src/screens/SignInScreen.tsx, MemberScreen.tsx, ManagerScreen.tsx
  src/components/ErrorBoundary.tsx, QuestionField.tsx, SummaryPanel.tsx
  src/styles/tokens.css, src/styles/app.css
  e2e/journeys.spec.ts, playwright.config.ts
packages/contracts/
  src/session.ts, surveys.ts, week.ts, errors.ts   the request and response Zod schemas (ADR-0008)
```

New dependencies, and nothing else: `apps/api` gains `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`,
`tsx` (to run the seed) and `zod` ([ADR-0006](/adr/0006-zod-at-the-api-edge.md)). `supertest`
is already a dev dependency of `apps/api`. `apps/web` gains none directly; it depends on the
`@pulse/contracts` workspace, which brings `zod` ([ADR-0008](/adr/0008-shared-contracts-package.md)).

Root scripts, added to the existing set:

| Script | What it runs |
| --- | --- |
| `db:bootstrap` | applies `apps/api/db/bootstrap.sql` in the Compose container |
| `db:migrate` | `drizzle-kit migrate` as `pulse_owner` |
| `db:seed` | `tsx src/db/seed-cli.ts` as `pulse_owner` |
| `db:reset` | `db:down -v`, `db:up`, `db:bootstrap`, `db:migrate`, `db:seed` |
| `test` | `apps/api` unit tests and `apps/web` component tests |
| `test:e2e` | `apps/api` e2e against `pulse_test`, prepared by the Vitest global setup |
| `test:e2e:web` | Playwright against the running dev stack |

Environment (`.env.example` and the README): `DATABASE_URL_OWNER`, `DATABASE_URL_APP`,
`TEST_DATABASE_URL_OWNER`, `TEST_DATABASE_URL_APP`, `AUTH_MODE` (default `off`; `dev` enables the
picker), `SESSION_TTL_HOURS` (default `12`), `API_PORT` (default `3000`).

## Test plan

The API e2e suites drive the Nest app with supertest, which `apps/api` already depends on. The RLS
and isolation suites connect as `pulse_app`, through `TEST_DATABASE_URL_APP`; a test that connects as
`pulse_owner` is not accepted as proof of a policy, because the owner is exempt from its own table's
policies. Migrations and the seed run as `pulse_owner` against `pulse_test`, and the Vitest global
setup drops and recreates the schemas before every run, then migrates and seeds:

```sql
DROP SCHEMA IF EXISTS public, dev, drizzle CASCADE;
CREATE SCHEMA public AUTHORIZATION pulse_owner;
```

Dropping `drizzle` matters: drizzle-kit records applied migrations in `drizzle.__drizzle_migrations`
(`references/drizzle-orm/drizzle-kit/src/index.ts:58`), so without it the second run is a no-op, the
tables never come back, and the grants from `0001_grants` are gone with them. Recreating `public`
owned by `pulse_owner` keeps the owner/app split the policies depend on. The roles are cluster-level
and survive, so `bootstrap.sql` runs once, when `pulse_test` is created.

| File | Kind | What it proves |
| --- | --- | --- |
| `test/week.spec.ts` | integration and unit | the SQL fragment against the database at Monday 00:00:00.000Z, Sunday 23:59:59.999Z, the next Monday at 00:00:00.001Z, and a month and a year boundary; `isWeekStart` and `weekLabel` as pure cases |
| `test/summary-maths.spec.ts` | unit | rate with zero eligible is null; rate with zero completed is 0; rate never exceeds 1; average null when count is 0; yes/no counts including an unanswered question; no other module divides |
| `test/rls.spec.ts` | integration, `pulse_app` | every case runs in a transaction that calls `set_config(..., true)` first, because the settings are transaction-local: org A sees no org B row; a Member sees only their own `responses` and `answers`, a Manager sees the organisation's; a Member's or a Manager's insert for another user is rejected; a Member cannot create or change a survey or a question; `sessions` cannot be listed and one row is visible only with the matching hash; with no settings set at all (the fail-closed case) every table returns 0 rows; `current_user` is not superuser and not `BYPASSRLS` |
| `test/isolation.e2e-spec.ts` | e2e, real sessions | an org A Manager reading org B's summary or patching org B's survey gets `404`; an org A Member submitting to org B's survey gets `404`; `/surveys/active` returns only the session's organisation's survey |
| `test/surveys.e2e-spec.ts` | e2e | `POST /api/surveys` as a Manager creates a survey with its questions; four questions, an unknown type and an over-long title are each `400`; a Member is `403`; a second active survey is `409`; `PATCH` archives and returns `200`, and a Member `PATCH` is `403` |
| `test/submit.e2e-spec.ts` | e2e | first submit `201` with one row per question; a second submit in the same week is `409` from the unique constraint and exactly one response row exists; an incomplete answer set, an extra question id and a type mismatch are each `400`; an archived survey is `409` |
| `test/summary.e2e-spec.ts` | e2e | zero responses: counts 0, averages null; the member who joined mid-week is in the denominator, the one deactivated before the week start is not, the one deactivated mid-week is; rating average and count; yes/no counts per option; rate never exceeds 1 |
| `test/auth.e2e-spec.ts` | e2e | no cookie is `401`; a tampered token is `401`; an expired session row is `401`; a session whose user has been deactivated is `401`; logout deletes the row and the next call is `401`; a Manager route with a Member session is `403` and the reverse is `403` |
| `test/dev-gate.e2e-spec.ts` | e2e | with `AUTH_MODE=off`, `/api/dev/users` and `/api/dev/sessions` are `404`; with `dev`, they answer, an unknown user id is `404` and a deactivated user is `404` |
| `apps/web/src/**/*.test.tsx` | component | the picker groups users by organisation; the Member screen shows the server's week label and one field per question; a `409` renders the duplicate message and a `400` the field message; the Manager summary renders the rate as a percentage and nulls as text, never `NaN`; the disabled state renders when `devSignIn` is false; a throwing child hits the error boundary; `App.test.tsx` replaces the template smoke test |
| `apps/web/e2e/journeys.spec.ts` | Playwright | the three journeys in [Front end](/pulse-surveys/frontend.md), against the real API and the Compose database, including the cross-organisation `404` |

The dev-flag-off case is an API e2e test, not a Playwright one, because it needs the server started
with a different `AUTH_MODE`. Playwright runs against the seeded development database, so the demo
and the test see the same data.
