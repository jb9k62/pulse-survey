/**
 * The database schema: tables, constraints and the row-level security (RLS) policies.
 * drizzle-kit generates the migrations in db/migrations from this file.
 *
 * RLS overview. Tenant isolation is enforced by PostgreSQL, not only by application code.
 * The decision and the rejected alternatives are in okf/adr/0005-rls-with-a-non-owner-app-role.md.
 *
 * 1. Two roles (db/bootstrap.sql). `pulse_owner` owns the schema and every table; it runs
 *    migrations and the seed. PostgreSQL exempts a table's owner from that table's policies,
 *    so the API never connects as it. `pulse_app` is the API's role: it owns nothing, is not a
 *    superuser and has no BYPASSRLS, so every policy applies to it without FORCE ROW LEVEL
 *    SECURITY. Its grants (migration 0001) decide the verbs; the policies decide the rows.
 *
 * 2. The tenant context reaches PostgreSQL as four transaction-local settings,
 *    `app.current_org`, `app.current_user`, `app.current_role` and
 *    `app.current_session_token`, which the policies read through the fragments in
 *    src/db/tenant-settings.ts. Per request:
 *    - AuthGuard (src/auth/auth.guard.ts) calls SessionsService.resolve
 *      (src/auth/sessions.service.ts), which turns the cookie into a principal in its own short
 *      transaction, setting the token, then the user, then the organisation, because each
 *      lookup is only visible once the setting before it is in place.
 *    - TenantTransactionInterceptor (src/common/tenant-transaction.interceptor.ts) then opens
 *      one transaction for the whole request and sets all four from that principal with
 *      `set_config(name, value, true)`, so nothing survives into the next request that
 *      borrows the pooled connection.
 *    - Handlers receive that transaction through `@CurrentTx()`, and every repository query
 *      runs on it. A query on the pool would run with no settings and see nothing.
 *
 * 3. The policy families, all `to: pulseApp`:
 *    - Organisation: `organisations`, `users`, `surveys` and `questions` match
 *      `app.current_org`, and writing a survey or a question also needs the Manager role.
 *      `users` also shows the caller's own row, which resolve needs before it knows the
 *      organisation; within the organisation, only Managers can read other users.
 *    - Member privacy: `responses` adds "a Manager, or the caller's own row" to the
 *      organisation match. `answers` has no organisation_id and inherits that rule from its
 *      parent response.
 *    - Session: a `sessions` row is visible, and deletable, only to a transaction that already
 *      holds its token hash, so the table cannot be listed.
 *    Every write policy repeats its predicate in WITH CHECK, so an INSERT or UPDATE cannot
 *    place a row outside the caller's organisation. Foreign key checks bypass RLS, so the
 *    composite foreign keys below are what stop a child row naming another organisation's
 *    parent.
 *
 * 4. It fails closed. With no setting, or the '' a reused pooled connection reports,
 *    `appOrg` and `appUser` are NULL, `col = NULL` is never true, reads return no rows and an
 *    INSERT fails its WITH CHECK (SQLSTATE 42501). Public routes get a transaction too, with
 *    every setting ''.
 *
 * 5. Guard rails. assertDatabaseInvariants (src/config.ts) refuses to start the API if its
 *    connection is a superuser, has BYPASSRLS, owns a table, or can SET ROLE to a role that
 *    does. The repository (src/surveys/surveys.repository.ts) also filters every query by
 *    organisation, so a wrong policy and a missing filter each have a second line behind them.
 *    test/rls.spec.ts checks the policies connected as pulse_app; as the owner it would pass
 *    whatever the policies said.
 *
 * 6. The dev exception. The dev sign-in picker lists users of every organisation and creates
 *    session rows, which pulse_app cannot do (no INSERT grant on sessions). Two SECURITY
 *    DEFINER functions in the `dev` schema (migration 0002) run as their owner, pulse_owner,
 *    and so skip RLS. Migration 0004 revokes pulse_app's access to them in every environment,
 *    src/db/dev-grants.ts grants it back on dev and test databases only, and
 *    assertDatabaseInvariants refuses to start when those grants disagree with AUTH_MODE.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgPolicy,
  pgRole,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  appOrg,
  appRole,
  appSessionToken,
  appUser,
} from './tenant-settings.js';

// Both roles exist outside Drizzle (db/bootstrap.sql creates them), so `.existing()`
// keeps drizzle-kit from emitting CREATE ROLE or DROP ROLE. pulseOwner is declared for
// completeness; no policy targets it, because the owner is exempt from RLS anyway.
export const pulseOwner = pgRole('pulse_owner').existing();
export const pulseApp = pgRole('pulse_app').existing();

export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('organisations_name_unique').on(t.name),
    // Read-only for pulse_app (SELECT grant only): the caller's own organisation row.
    pgPolicy('organisations_select_own', {
      as: 'permissive',
      for: 'select',
      to: pulseApp,
      using: sql`${t.id} = ${appOrg}`,
    }),
  ],
).enableRLS();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    name: text('name').notNull(),
    role: text('role').$type<'manager' | 'member'>().notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Redundant with the primary key, but a composite FK needs a unique target. It lets
    // responses reference (organisation_id, user_id), so a response cannot name a user of
    // another organisation.
    unique('users_organisation_id_id_unique').on(t.organisationId, t.id),
    check('users_role_check', sql`${t.role} IN ('manager', 'member')`),
    check(
      'users_deactivated_at_check',
      sql`${t.deactivatedAt} IS NULL OR ${t.deactivatedAt} >= ${t.joinedAt}`,
    ),
    check('users_joined_at_check', sql`${t.joinedAt} <= ${t.createdAt}`),
    index('users_organisation_idx').on(t.organisationId),
    // Read-only for pulse_app. The self branch lets SessionsService.resolve read the user
    // before app.current_org is set. Members can read only their own row; Managers can read
    // every user row of their own organisation.
    pgPolicy('users_select_self_or_org', {
      as: 'permissive',
      for: 'select',
      to: pulseApp,
      using: sql`${t.id} = ${appUser} OR (${t.organisationId} = ${appOrg} AND ${appRole} = 'manager')`,
    }),
  ],
).enableRLS();

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('sessions_expires_at_check', sql`${t.expiresAt} > ${t.createdAt}`),
    check('sessions_token_hash_check', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
    // No INSERT policy or grant: pulse_app creates sessions only through the SECURITY
    // DEFINER dev.create_session. A row is visible, and deletable (logout, or an expired
    // session in resolve), only when app.current_session_token already holds its hash, so
    // the caller must present the cookie to reach its own row and can never list the table.
    pgPolicy('sessions_select_own_token', {
      as: 'permissive',
      for: 'select',
      to: pulseApp,
      using: sql`${t.tokenHash} = ${appSessionToken}`,
    }),
    pgPolicy('sessions_delete_own_token', {
      as: 'permissive',
      for: 'delete',
      to: pulseApp,
      using: sql`${t.tokenHash} = ${appSessionToken}`,
    }),
  ],
).enableRLS();

export const surveys = pgTable(
  'surveys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    title: text('title').notNull(),
    status: text('status')
      .$type<'active' | 'archived'>()
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Composite FK target for questions and responses (same trick as users).
    unique('surveys_organisation_id_id_unique').on(t.organisationId, t.id),
    check('surveys_status_check', sql`${t.status} IN ('active', 'archived')`),
    // Partial unique index: at most one 'active' row per organisation. Archived rows are
    // not in the index. A violation is mapped to 409 by the exception filter.
    uniqueIndex('surveys_one_active_per_org')
      .on(t.organisationId)
      .where(sql`${t.status} = 'active'`),
    // Everyone in the organisation reads its surveys; only a Manager creates or changes one
    // (requirement 4.1.4), so the role rule holds in the database and not only in the
    // controller. WITH CHECK stops a write placing a survey in another organisation.
    // pulse_app has no DELETE grant on surveys.
    pgPolicy('surveys_select_org', {
      as: 'permissive',
      for: 'select',
      to: pulseApp,
      using: sql`${t.organisationId} = ${appOrg}`,
    }),
    pgPolicy('surveys_insert_manager', {
      as: 'permissive',
      for: 'insert',
      to: pulseApp,
      withCheck: sql`${t.organisationId} = ${appOrg} AND ${appRole} = 'manager'`,
    }),
    pgPolicy('surveys_update_manager', {
      as: 'permissive',
      for: 'update',
      to: pulseApp,
      using: sql`${t.organisationId} = ${appOrg} AND ${appRole} = 'manager'`,
      withCheck: sql`${t.organisationId} = ${appOrg} AND ${appRole} = 'manager'`,
    }),
  ],
).enableRLS();

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: uuid('organisation_id').notNull(),
    surveyId: uuid('survey_id').notNull(),
    position: smallint('position').notNull(),
    type: text('type').$type<'rating' | 'yes_no'>().notNull(),
    prompt: text('prompt').notNull(),
  },
  (t) => [
    // FK target for answers, so an answer's question must belong to the answer's survey.
    unique('questions_survey_id_id_unique').on(t.surveyId, t.id),
    // The question's organisation_id must equal its survey's, so the org column the
    // policy filters on cannot disagree with the parent survey. RLS alone would not catch
    // this: foreign key checks bypass policies, so without the composite key a question in
    // org A could point at a survey in org B.
    foreignKey({
      name: 'questions_organisation_id_survey_id_surveys_organisation_id_id_fk',
      columns: [t.organisationId, t.surveyId],
      foreignColumns: [surveys.organisationId, surveys.id],
    }),
    // Together these cap a survey at 3 questions in the database: positions are 1..3 and
    // each position is used once.
    unique('questions_survey_id_position_unique').on(t.surveyId, t.position),
    check('questions_position_check', sql`${t.position} BETWEEN 1 AND 3`),
    check('questions_type_check', sql`${t.type} IN ('rating', 'yes_no')`),
    // Same split as surveys: the organisation reads, a Manager inserts. pulse_app has no
    // UPDATE or DELETE grant on questions.
    pgPolicy('questions_select_org', {
      as: 'permissive',
      for: 'select',
      to: pulseApp,
      using: sql`${t.organisationId} = ${appOrg}`,
    }),
    pgPolicy('questions_insert_manager', {
      as: 'permissive',
      for: 'insert',
      to: pulseApp,
      withCheck: sql`${t.organisationId} = ${appOrg} AND ${appRole} = 'manager'`,
    }),
  ],
).enableRLS();

export const responses = pgTable(
  'responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: uuid('organisation_id').notNull(),
    surveyId: uuid('survey_id').notNull(),
    userId: uuid('user_id').notNull(),
    weekStart: date('week_start').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // FK target for answers (see answers below).
    unique('responses_survey_id_id_unique').on(t.surveyId, t.id),
    // The two composite FKs pin the survey and the user to the response's organisation,
    // so a cross-organisation response cannot be stored even by a buggy query.
    foreignKey({
      name: 'responses_organisation_id_survey_id_surveys_organisation_id_id_fk',
      columns: [t.organisationId, t.surveyId],
      foreignColumns: [surveys.organisationId, surveys.id],
    }),
    foreignKey({
      name: 'responses_organisation_id_user_id_users_organisation_id_id_fk',
      columns: [t.organisationId, t.userId],
      foreignColumns: [users.organisationId, users.id],
    }),
    // The one-response-per-week rule. week_start is always computed by the database
    // (week.ts), never taken from the request body.
    unique('responses_survey_id_user_id_week_start_unique').on(
      t.surveyId,
      t.userId,
      t.weekStart,
    ),
    index('responses_org_week_idx').on(t.organisationId, t.weekStart),
    index('responses_survey_week_idx').on(t.surveyId, t.weekStart),
    // Organisation isolation plus member privacy: a Manager reads every response of their
    // organisation, a Member only their own.
    pgPolicy('responses_select_org', {
      as: 'permissive',
      for: 'select',
      to: pulseApp,
      using: sql`${t.organisationId} = ${appOrg} AND (${appRole} = 'manager' OR ${t.userId} = ${appUser})`,
    }),
    // Anyone, Manager included, inserts a response only as themselves: a response is the
    // caller's own answer, never one filed on someone else's behalf. No UPDATE or DELETE
    // grant, so a submitted response cannot change.
    pgPolicy('responses_insert_own', {
      as: 'permissive',
      for: 'insert',
      to: pulseApp,
      withCheck: sql`${t.organisationId} = ${appOrg} AND ${t.userId} = ${appUser}`,
    }),
  ],
).enableRLS();

export const answers = pgTable(
  'answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surveyId: uuid('survey_id').notNull(),
    responseId: uuid('response_id').notNull(),
    questionId: uuid('question_id').notNull(),
    ratingValue: smallint('rating_value'),
    yesNoValue: boolean('yes_no_value'),
  },
  // answers has no organisation_id. It inherits the tenant through its response: both FKs
  // share survey_id, so the question and the response must belong to the same survey,
  // and the policy below checks the parent response.
  (t) => [
    foreignKey({
      name: 'answers_survey_id_question_id_questions_survey_id_id_fk',
      columns: [t.surveyId, t.questionId],
      foreignColumns: [questions.surveyId, questions.id],
    }),
    foreignKey({
      name: 'answers_survey_id_response_id_responses_survey_id_id_fk',
      columns: [t.surveyId, t.responseId],
      foreignColumns: [responses.surveyId, responses.id],
    }),
    unique('answers_response_id_question_id_unique').on(
      t.responseId,
      t.questionId,
    ),
    // Exactly one of the two value columns is set.
    check(
      'answers_one_value_check',
      sql`num_nonnulls(${t.ratingValue}, ${t.yesNoValue}) = 1`,
    ),
    check(
      'answers_rating_value_check',
      sql`${t.ratingValue} IS NULL OR ${t.ratingValue} BETWEEN 1 AND 5`,
    ),
    index('answers_response_idx').on(t.responseId),
    // The subquery on responses runs as pulse_app, so responses_select_org also applies
    // inside it. The org and role test here is a second, explicit copy of that rule, so the
    // policy still holds if the responses policy is ever loosened.
    pgPolicy('answers_select_org', {
      as: 'permissive',
      for: 'select',
      to: pulseApp,
      using: sql`EXISTS (SELECT 1 FROM responses r WHERE r.id = ${t.responseId} AND r.organisation_id = ${appOrg} AND (${appRole} = 'manager' OR r.user_id = ${appUser}))`,
    }),
    // An answer can only be added to the caller's own response, matching responses_insert_own.
    pgPolicy('answers_insert_own', {
      as: 'permissive',
      for: 'insert',
      to: pulseApp,
      withCheck: sql`EXISTS (SELECT 1 FROM responses r WHERE r.id = ${t.responseId} AND r.organisation_id = ${appOrg} AND r.user_id = ${appUser})`,
    }),
  ],
).enableRLS();

export type OrganisationRow = typeof organisations.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SurveyRow = typeof surveys.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type ResponseRow = typeof responses.$inferSelect;
export type AnswerRow = typeof answers.$inferSelect;
