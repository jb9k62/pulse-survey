---
name: drizzle-reference
description: >
  Map of verified Drizzle ORM 0.45 patterns inside this repo's pinned source checkout at
  references/drizzle-orm. Covers pg-core schema and column types, unique constraints and
  indexes, RLS policies, selects, inserts with conflict handling, transactions, aggregate
  functions, relational queries, drizzle-kit migrations and drizzle-seed. Use when writing
  or reviewing Drizzle schema, queries, migrations or seed data in this project, and before
  copying an example from the docs site or an older Drizzle version.
---

# Drizzle reference

The Drizzle ORM monorepo is vendored in this repo as a read-only git submodule, pinned to
the latest stable release. It is the source of truth for how Drizzle behaves in the
version we use, so read it instead of guessing.

- Source: `references/drizzle-orm`
- Pinned at commit `15454dbe49d827c6081f3d0231e2e7985e517295`, which is tag `0.45.3` (shallow, depth 1)
- Missing after a clone: `git submodule update --init --depth 1`

The commit is the authoritative pin. A fresh clone fetches that one commit, not the tag ref, so
`git describe --tags` inside the submodule is not a reliable way to check the version.

The monorepo holds more than the ORM: `drizzle-orm/`, `drizzle-kit/` (migrations),
`drizzle-zod/`, `drizzle-seed/`, and the `integration-tests/` suite that exercises all of
them against real databases.

Every path below is relative to the **repository root**. This skill file lives at
`.pi/skills/drizzle-reference/SKILL.md`.

Treat the submodule as read-only. Never edit it, never import from it, never add it to
`tsconfig` paths. It is reference material only.

## Rule

Do not invent Drizzle APIs. Find the pattern in `references/drizzle-orm` first, then write
the project code to match. The `integration-tests/` suite is the best source: it is real,
tested usage of every feature, not a sketch.

## Where to look

Start at `references/drizzle-orm/drizzle-orm/src/pg-core/index.ts`. It is the export barrel
and lists every public pg-core module in one screen.

| I need to... | Read |
|---|---|
| Define a table | `references/drizzle-orm/drizzle-orm/src/pg-core/table.ts` |
| Pick a column type | `references/drizzle-orm/drizzle-orm/src/pg-core/columns/` (`integer.ts`, `boolean.ts`, `uuid.ts`, `timestamp.ts`, `text.ts`, `varchar.ts`, `serial.ts`) |
| Add a primary key | `references/drizzle-orm/drizzle-orm/src/pg-core/primary-keys.ts` |
| Enforce uniqueness (one response per week) | `references/drizzle-orm/drizzle-orm/src/pg-core/unique-constraint.ts` |
| Add an index | `references/drizzle-orm/drizzle-orm/src/pg-core/indexes.ts` |
| Add a foreign key | `references/drizzle-orm/drizzle-orm/src/pg-core/foreign-keys.ts` |
| Add a check constraint | `references/drizzle-orm/drizzle-orm/src/pg-core/checks.ts` |
| Add a row-level security policy | `references/drizzle-orm/drizzle-orm/src/pg-core/policies.ts`, `references/drizzle-orm/drizzle-orm/src/pg-core/roles.ts` |
| See policies in a test | `references/drizzle-orm/integration-tests/tests/pg/rls/rls.definition.test.ts` |
| Build a select, join or group by | `references/drizzle-orm/drizzle-orm/src/pg-core/query-builders/select.ts` |
| Insert and handle a conflict | `references/drizzle-orm/drizzle-orm/src/pg-core/query-builders/insert.ts` (`onConflictDoNothing`, `returning`) |
| Update or delete | `references/drizzle-orm/drizzle-orm/src/pg-core/query-builders/update.ts`, `.../delete.ts` |
| Run a transaction | `references/drizzle-orm/drizzle-orm/src/pg-core/db.ts` (`transaction`) |
| Count rows cheaply | `references/drizzle-orm/drizzle-orm/src/pg-core/db.ts` (`$count`), `.../query-builders/count.ts` |
| Aggregate for the weekly summary | `references/drizzle-orm/drizzle-orm/src/sql/functions/aggregate.ts` (`count`, `countDistinct`, `avg`, `sum`) |
| Declare relations and run relational queries | `references/drizzle-orm/drizzle-orm/src/relations.ts`, `references/drizzle-orm/drizzle-orm/src/pg-core/query-builders/query.ts` |
| Connect the node-postgres driver | `references/drizzle-orm/drizzle-orm/src/node-postgres/driver.ts`, `references/drizzle-orm/integration-tests/tests/pg/node-postgres.test.ts` |
| See a full schema plus queries | `references/drizzle-orm/integration-tests/tests/pg/pg-common.ts` |
| See relational schema and query tests | `references/drizzle-orm/integration-tests/tests/relational/pg.schema.ts`, `references/drizzle-orm/integration-tests/tests/relational/pg.test.ts` |
| Configure drizzle-kit | `references/drizzle-orm/drizzle-kit/tests/cli/drizzle.config.ts` |
| See the migration commands | `references/drizzle-orm/drizzle-kit/src/cli/schema.ts`, `references/drizzle-orm/drizzle-kit/src/cli/commands/migrate.ts` |
| Drive migrations from code | `references/drizzle-orm/drizzle-kit/src/api.ts` (`generateDrizzleJson`, `generateMigration`, `pushSchema`) |
| Build Zod schemas from tables | `references/drizzle-orm/drizzle-zod/src/index.ts` |
| Generate seed data | `references/drizzle-orm/drizzle-seed/src/index.ts` |

## Version gotchas

These are real differences in 0.45 that older tutorials and the in-repo README get wrong.

- The third argument of `pgTable` takes an **array** now: `(table) => [index(...), unique(...)]`.
  The older object form, `(table) => ({ idx: index(...) })`, still typechecks for
  back-compat but is legacy. `table.ts` accepts both (`PgTableExtraConfigValue[]` or the
  object record), so match the array form. Note that `references/drizzle-orm/drizzle-kit/README.md`
  still shows the old object form, so do not copy that snippet.
- Aggregate return types are not all numbers. `count()` returns `SQL<number>`, but `avg()`
  and `sum()` return `SQL<string | null>` because PostgreSQL returns numerics as strings.
  Convert before doing arithmetic or returning JSON, and check `null` when no rows match.
- Drizzle's own internals import through a `~/*` alias with explicit `.ts` extensions
  (`from '~/entity.ts'`). That is a monorepo-internal convention. Our project imports from
  the published package names, `drizzle-orm` and `drizzle-orm/pg-core`.
- The single `drizzle.config.ts` in the repo is a test fixture under `drizzle-kit/tests/`.
  It is a valid minimal shape, not a production config.
- `drizzle-kit` and `drizzle-orm` versions are pinned together by peer dependency. Keep
  them on the same release line.

## Project rules that shape how we use this

- Tenant isolation is the top rule, and the database should help enforce it. Read
  `pg-core/policies.ts` and `pg-core/roles.ts` before deciding how far to take row-level
  security, and record the decision as an ADR either way.
- A Member submits at most one response per active week per survey, enforced in the
  database. A composite unique constraint over (survey, member, week) is the primary
  mechanism, with `onConflictDoNothing({ target: ... })` on insert. `unique-constraint.ts`
  and the insert builder are the two files to read.
- Surveys hold at most 3 questions, with types rating (1 to 5) and yes/no. Enforce the
  question types with a check constraint or a column type, not only in the service layer.
- The weekly summary needs completion count, completion rate against the member count, a
  rating average with its count, and yes/no counts per option. `sql/functions/aggregate.ts`
  covers all of it. Test the maths directly.
- Seed data must cover at least 2 organisations with Managers, Members and an active survey
  each. `drizzle-seed/` is available if hand-written fixtures get awkward.
