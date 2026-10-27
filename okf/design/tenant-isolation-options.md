---
type: Design Note
title: "Tenant isolation: what Drizzle and Nest actually give us"
description: What the pinned Drizzle and NestJS versions do for row-level security, where each one stops, and the application-layer plumbing the gap needs.
tags: [multi-tenancy, security, rls, postgres, drizzle, nestjs]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-25 }
sources:
  - resource: references/drizzle-orm
    title: drizzle-orm 0.45.3, pinned submodule at commit 15454db
  - resource: references/nest
    title: NestJS 12.1.0, pinned submodule at commit 6739656
  - resource: requirements.md
    title: Section 3.2, tenant isolation approach is a stated choice
  - resource: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
    title: PostgreSQL 18 manual, 5.9 Row Security Policies
  - resource: https://www.postgresql.org/docs/current/app-pgdump.html
    title: PostgreSQL 18 manual, pg_dump, --enable-row-security
  - resource: https://github.com/drizzle-team/drizzle-orm/issues/5819
    title: drizzle-orm issue 5819, add .forceRLS() to the pgTable builder (open)
  - resource: https://github.com/drizzle-team/drizzle-orm/pull/5843
    title: drizzle-orm pull request 5843, implement .forceRLS() (open)
  - resource: https://github.com/drizzle-team/drizzle-orm/issues/4948
    title: drizzle-orm issue 4948, RLS is disabled on every run of push (open)
  - resource: https://github.com/drizzle-team/drizzle-orm/issues/4763
    title: drizzle-orm issue 4763, disable RLS management by config (open)
---

# Tenant isolation: what Drizzle and Nest actually give us

Research note behind the isolation decision: scope in the application layer, use database row-level
policies, or both. The decision it fed is now recorded in
[ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md), and the note's closing section says what the
choice implies. The Drizzle and Nest claims were
read out of the pinned submodules, with file paths. The PostgreSQL behaviour and the current
upstream Drizzle status were checked against the PostgreSQL manual and the drizzle-orm issue
tracker on 2026-09-25, and are linked where they are used.

## Short answers

**Does Drizzle help with PostgreSQL row-level security?** Yes, and quite well, for the parts
that are declarative. Drizzle ORM lets you describe policies and roles in the schema, and
drizzle-kit generates the `CREATE POLICY` and `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
statements in migrations.

**Does Drizzle enforce anything?** No. Enforcement is entirely PostgreSQL's job. At this pin
Drizzle never sets the session variable that a policy reads, and it never emits
`FORCE ROW LEVEL SECURITY`. Both gaps have to be closed elsewhere, and that elsewhere is the
application layer, which is where NestJS comes in.

**Does NestJS help?** Not with RLS itself, since it knows nothing about PostgreSQL. What it
gives you is the plumbing to make the application layer trustworthy: one place to authenticate,
one place to bind a request to a transaction, and one place to inject the organisation id.

## Part 1: what Drizzle gives you

### The schema side

`pgTable` returns a table with an `enableRLS()` method (`references/drizzle-orm/drizzle-orm/src/pg-core/table.ts`).
Calling it sets an internal flag, and the table is then marked as RLS-enabled in the snapshot.

Naming caveat when comparing this note with the documentation site: at the pin the method is
`.enableRLS()`, which is also what the 0.36.0 changelog documents. The current Drizzle RLS page
documents `pgTable.withRLS(...)` instead, a later rename. So a reader following the docs site
will not find `enableRLS`, and a reader following the pin will not find `withRLS`.

Policies are described with `pgPolicy(name, config)` (`references/drizzle-orm/drizzle-orm/src/pg-core/policies.ts`),
whose config is small enough to quote in full:

| Field | Meaning |
| --- | --- |
| `as` | `permissive` or `restrictive` |
| `for` | `all`, `select`, `insert`, `update` or `delete` |
| `to` | `public`, `current_role`, `current_user`, `session_user`, a role name, or a `PgRole` |
| `using` | the SQL predicate for reading existing rows |
| `withCheck` | the SQL predicate for rows being written |

Roles come from `pgRole(name, config)` with an `.existing()` modifier, for a role that already
exists in the database (`references/drizzle-orm/drizzle-orm/src/pg-core/roles.ts`).

Policies are attached in the third argument of `pgTable`, which takes an array. The in-repo
test `references/drizzle-orm/integration-tests/tests/pg/rls/rls.definition.test.ts` shows the
shape:

```ts
pgTable('hhh', { id: integer() }, () => [
  pgPolicy('name'),
  crudPolicy({ role: pgRole('users'), read: true, modify: true }),
]);
```

There is also a convenience helper, `crudPolicy({ role, read, modify })`, which expands into
four policies named `crud-<role>-policy-select`, `-insert`, `-update` and `-delete`
(`references/drizzle-orm/drizzle-orm/src/neon/rls.ts`).

**Caveat worth flagging early.** `crudPolicy`, `authenticatedRole`, `anonymousRole` and
`authUid` all live under `drizzle-orm/neon`, and they depend on the Neon platform's
`auth.user_id()` function and its pre-created roles. They are not portable to a local
PostgreSQL. `pgPolicy` and `pgRole` are the general-purpose pieces and are what a local
Postgres setup would use.

### The migration side

drizzle-kit turns that schema into real SQL
(`references/drizzle-orm/drizzle-kit/src/sqlgenerator.ts`):

```sql
CREATE POLICY "name" ON "table" AS PERMISSIVE FOR SELECT TO role USING (...) WITH CHECK (...);
DROP POLICY "name" ON "table" CASCADE;
ALTER TABLE "table" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "table" DISABLE ROW LEVEL SECURITY;
```

It also infers the RLS toggle. When a table gains its first policy and `isRLSEnabled` is false,
the differ emits an `enable_rls` statement on its own
(`references/drizzle-orm/drizzle-kit/src/snapshotsDiffer.ts`). So in the common case you write
the policy and the migration enables RLS for that table without you asking.

### Gap 1: nothing sets the tenant identity

A policy predicate has to read the organisation from somewhere. The usual PostgreSQL idiom is
`current_setting('app.current_org')`, set per transaction with `set_config('app.current_org',
$1, true)` or `SET LOCAL`.

Drizzle does not do this. Searching `drizzle-orm/src`, `drizzle-kit/src` and the PostgreSQL
integration tests for `set_config`, `SET LOCAL` and `current_setting` returns nothing. So the
policy you can declare has no source for its value unless the application provides one. This
is the single most important thing to know about Drizzle and RLS: **the declaration is
supported, the plumbing is not.**

### Gap 2: `FORCE ROW LEVEL SECURITY` is absent

PostgreSQL exempts a table's **owner** from that table's RLS policies. Superusers and roles with
the `BYPASSRLS` attribute bypass RLS always, and `FORCE` does not change that: it only closes the
owner hole. The manual states that "table owners normally bypass row security as well, though a
table owner can choose to be subject to row security with `ALTER TABLE ... FORCE ROW LEVEL
SECURITY`" ([Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)).

`ENABLE ROW LEVEL SECURITY` on its own therefore does nothing for the user that owns the tables,
which is exactly the user a local development setup usually connects as. The fix is
`ALTER TABLE ... FORCE ROW LEVEL SECURITY`, which applies policies to the owner too. At the pinned
commit that statement appears nowhere in the repository, and drizzle-kit only ever emits `ENABLE`
and `DISABLE`. A grep for `force row level security` across the whole submodule returns nothing.

This is a known upstream gap rather than a deliberate design. Issue
[#5819](https://github.com/drizzle-team/drizzle-orm/issues/5819) asks for a `.forceRLS()` modifier
and pull request [#5843](https://github.com/drizzle-team/drizzle-orm/pull/5843) implements it: a
`forceRLS` table flag, `FORCE` and `NO FORCE` statements in the diff, `FORCE` appended after
`ENABLE` on table creation, and introspection of `relforcerowsecurity` so a pull round-trips the
flag. Both were still open on 2026-09-25, so the gap is closing but has not closed. The first
thing to do on a version bump is to re-check whether `forceRLS` has shipped.

Until then there are two fixes, and most production guidance prefers the first:

- A **separate, non-owner application role**. One role owns the schema and runs migrations,
another role gets only the DML (Data Manipulation Language: `SELECT`, `INSERT`, `UPDATE`, `DELETE`) grants the app needs and is therefore subject to the policies
without any `FORCE` at all. This is the stronger option, because it also removes the temptation to
connect the app as a superuser or as a `BYPASSRLS` role, which no policy can contain.
- A **hand-written `FORCE` statement** in a migration, which is cheaper locally but moves the
cost onto the owner. The owner is now subject to the policies, so the same role that seeds and
maintains the database hits them. A seed that inserts rows for several organisations fails under
a tenant policy unless it sets the session variable per organisation or runs as a role that may
bypass RLS. `pg_dump` sets `row_security` to `off` by default and throws an error if the dumping
role cannot bypass row security, so a backup of a forced table needs a `BYPASSRLS` role or
`--enable-row-security` ([pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)).

The two are not exclusive. A non-owner app role is the primary fix, and `FORCE` on top of it
contains the owner as well.

This failure mode is dangerous because it is silent. RLS is enabled, policies exist, the
schema looks correct, and every query still returns every organisation's rows. That is worse
than having no RLS at all, because it reads as enforced.

### Hazard: drizzle-kit changes RLS it does not know about

A hand-written RLS migration is only safe while drizzle-kit cannot disagree with it. Two open
issues describe drizzle-kit changing RLS on its own. Issue
[#4948](https://github.com/drizzle-team/drizzle-orm/issues/4948) reports `drizzle-kit push`
emitting `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` for tables whose policies are not declared
in the schema, and issue [#4763](https://github.com/drizzle-team/drizzle-orm/issues/4763) reports
policies being deleted and RLS disabled the same way. Both were open on 2026-09-25.

So the shape that holds together is: declare the policies in `schema.ts`, keep the single `FORCE`
statement in a generated migration applied by `drizzle-kit migrate`, and do not run `push` against
a database whose RLS state is hand-managed.

### Gap 3: policies do not cover everything

Even with correct policies, RLS has edges worth knowing before relying on it:

- Referential integrity checks bypass RLS, so a foreign key can point at a row the policy
  would hide.
- `TRUNCATE` is not subject to row security.
- A policy is per table. A join across a table without policies leaks that table's rows
  freely, so coverage has to be complete, not partial.

## Part 2: what NestJS gives you

Nest has no concept of a tenant. What it has is a small set of extension points that make the
application layer the right place to put the enforcement, and that keep it in one place
instead of scattered across controllers.

### One place to authenticate and to authorise

`APP_GUARD`, `APP_INTERCEPTOR`, `APP_PIPE` and `APP_FILTER`
(`references/nest/packages/core/constants.ts`) are provider tokens that register a global
guard, interceptor, pipe or filter through the DI container. A global guard means every route
is authenticated by default, and a route has to opt out explicitly rather than opt in. The
pinned samples show the shape in
`references/nest/sample/19-auth-jwt/src/auth/auth.guard.ts` and its registration in
`references/nest/sample/19-auth-jwt/src/auth/auth.module.ts`.

That guard is where the organisation id is derived, and it is the only place it should ever
be derived from. `Reflector.createDecorator` plus a `@Public()` or `@TenantScoped()` marker
covers the exceptions, as in
`references/nest/sample/19-auth-jwt/src/auth/decorators/public.decorator.ts`. Where the guard's
input comes from at request time (a session cookie backed by a row in the database, and not a
client-supplied header) is decided in
[ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md).

### One place to expose the organisation to handlers

`createParamDecorator` (`references/nest/packages/common/decorators/http/create-route-param-metadata.decorator.ts`)
turns the request-attached user into a `@CurrentOrg()` or `@CurrentUser()` parameter
decorator, so a handler receives the organisation id as an argument. Handlers then never read
it from the body, the query string or a route param, which is the rule this project has to
keep.

### One place to bind the request to a transaction

This is the piece that closes Gap 1. An interceptor can wrap the whole handler in
`db.transaction(...)` and, inside that transaction, set the organisation:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
  return handler(tx);
});
```

Two details make this work rather than nearly work:

- `set_config` must be called with `is_local = true` (the third argument), which is
  transaction-scoped, so it cannot leak to the next request that borrows the same pooled
  connection. A session-scoped `SET` on a pooled connection is a cross-tenant data leak
  waiting to happen.
- The queries must run on `tx`, the transaction handle, not on the outer `db`. Any query that
  escapes to `db` runs on a different connection with no setting and silently sees
  everything.

Nest's request scope is how a per-request handle gets injected rather than passed by hand.
`Scope.REQUEST` and the `durable` flag
(`references/nest/packages/common/interfaces/scope-options.interface.ts`) are the mechanism,
with `REQUEST` (`references/nest/packages/core/router/request/request-constants.ts`) as the
injection token. A request-scoped provider is built once per request and shared by every
consumer in it (one per consumer is `Scope.TRANSIENT`), but the scope spreads upwards: every
provider that depends on it is rebuilt per request too. Durable providers let Nest reuse one
subtree per tenant instead. The app passes the transaction as an argument and avoids both; see
the [Nest tour](/pulse-surveys/nest-explainer.md). The
`references/nest/integration/scopes/e2e/` suite covers both.

### AsyncLocalStorage is the sanctioned way to carry the context

Nest core itself uses `AsyncLocalStorage` for context propagation, for example in
`references/nest/packages/core/interceptors/interceptors-consumer.ts` and the microservices
context creator. Nest does not ship a public context module of its own; `nestjs-cls` is a
third-party wrapper around exactly this. So an ALS-based `RequestContext` holding the
organisation id is idiomatic for this version, but it is our code, not a framework feature.

### What Nest cannot do

- It cannot make a query tenant-safe. A repository method that forgets its `where` clause is
  still wrong, and no guard catches it.
- It cannot verify that a policy is actually in force. Gap 2 is invisible from the
  application layer.
- It cannot audit its own coverage for you. A `DiscoveryService` scan over registered
  providers is a plausible way to look for data access that bypasses the scoped repository,
  but that is a thing to build, not a thing to enable.

## Comparison

| | Application-layer scoping | PostgreSQL RLS | Both |
| --- | --- | --- | --- |
| Where the rule lives | Repository and service code | Schema and migrations | Both |
| Fails when a query forgets the filter | Yes, silently | No | No |
| Needs a session variable | No | Yes, and Drizzle will not set it | Yes |
| Needs a non-owner role, or `FORCE RLS` | No | Yes | Yes |
| Contains a superuser or a `BYPASSRLS` role | n/a | No | No |
| Cost in this timebox | Low | Medium: a second role, a hand-written migration step, and tests that connect as that role | Medium to high |
| Demo value | Isolation is visible in the code | Isolation is enforced by the database, which is the stronger claim |

## The trap that matters most for testing

An isolation test proves nothing unless it connects as the role that RLS actually applies to.
The default local setup connects as the database owner, RLS is bypassed for that user, and the
test passes whether or not any policy is correct. A superuser or a role with `BYPASSRLS` defeats
the test in exactly the same way. So the RLS test has to run as a non-owner role, or
`FORCE ROW LEVEL SECURITY` has to be in place, or both. This is the same mistake as a Mermaid
gate that passes because it found zero diagrams.

## The decision this note feeds

**Settled on 2026-09-26:** tenant isolation is enforced by PostgreSQL row-level security,
with the API connecting as a separate non-owner role, and application-layer scoping kept as a
second layer. The full record, including the two narrow exceptions for queries that run before
a tenant context exists, is [ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md).

What the choice implies, in the order the gaps above were listed:

- **Gap 1, nothing sets the tenant identity.** Closed in the application: one transaction per
  request, with `set_config('app.current_org', ..., true)`, `app.current_user` and
  `app.current_role` set on that transaction, and every repository method taking the
  transaction handle rather than the connection pool.
- **Gap 2, `FORCE` is absent.** Sidestepped rather than worked around: `pulse_app` owns no
  table, so the owner exemption never applies to it and no `FORCE` statement is needed. The
  owner role runs migrations and seed data, where bypassing the policies is what you want.
- **Gap 3, policies do not cover everything.** Accepted and stated: `TRUNCATE` and referential
  integrity checks stay outside the rule, so the tests assert the paths the application
  actually uses.
- **The testing trap.** The isolation tests connect as `pulse_app`, so a missing or wrong
  policy fails the test instead of passing quietly.

Two queries cannot wait for a tenant context, and each gets a named exception rather than an
open policy: the session lookup (a policy on `sessions` that matches the token hash set for
that transaction, so the table cannot be listed) and the dev user directory (a `SECURITY
DEFINER` function in a `dev` schema, called only when the dev flag is on, because listing
seeded users across organisations is the disclosure ADR-0002 already records).
