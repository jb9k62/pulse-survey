---
type: Architectural Decision
title: "ADR-0005: Row-level security with a non-owner application role"
description: "Tenant isolation is enforced by PostgreSQL row-level security, declared in Drizzle, with the API connecting as a separate non-owner role and the tenant context set per transaction."
tags: [multi-tenancy, security, rls, postgres, drizzle, adr]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: requirements.md
    title: Sections 2.6, 3.2 and 4.1.7
  - resource: okf/design/tenant-isolation-options.md
    title: The research note, including the three gaps and the testing trap
  - resource: references/drizzle-orm/drizzle-orm/src/pg-core/policies.ts
    title: pgPolicy at the pin
  - resource: references/drizzle-orm/drizzle-orm/src/pg-core/table.ts
    title: enableRLS() at the pin
  - resource: references/drizzle-orm/drizzle-kit/src/sqlgenerator.ts
    title: CREATE POLICY and ENABLE ROW LEVEL SECURITY generation
  - resource: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
    title: PostgreSQL 18 manual, 5.9 Row Security Policies
  - resource: https://github.com/drizzle-team/drizzle-orm/issues/4948
    title: drizzle-kit push disables RLS it does not know about (open)
  - resource: okf/adr/0002-dev-sign-in-with-server-side-sessions.md
    title: Where the organisation and role come from at request time
---

# ADR-0005: Row-level security with a non-owner application role

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Jordan Hunt

## Context

Requirements 2.6 and 4.1.7 make isolation the top rule: one organisation must never read or
write another's data. The brief for this slice adds a second claim, that a Member must not read
another Member's response either. Requirement 3.2 lets us choose between scoping in the
application layer and database row policies.

The [research note](/design/tenant-isolation-options.md) established what the pinned versions
actually do. Drizzle can declare policies (`pgPolicy`) and mark a table as RLS-enabled
(`enableRLS()`), and drizzle-kit generates `CREATE POLICY` and `ENABLE ROW LEVEL SECURITY`. But
nothing in Drizzle or drizzle-kit sets the session variable a policy reads, and nothing emits
`FORCE ROW LEVEL SECURITY`. PostgreSQL exempts a table's owner from that table's policies, so
RLS on its own, applied to a database the application connects to as its owner, is decoration.

## Decision

We will enforce tenant isolation with PostgreSQL row-level security, and connect the API as a
role that owns nothing.

- **Two roles.** `pulse_owner` owns the schema and runs migrations and seed data.
  `pulse_app` holds only the grants the API needs (migration 0001): `select` on
  `organisations` and `users`, `select` and `delete` on `sessions`, `select`, `insert` and
  `update` on `surveys`, and `select` and `insert` on `questions`, `responses` and `answers`.
  It has no `update` or `delete` on responses, so a submitted response cannot change. It is the
  role the API connects as. Because `pulse_app` owns no table, the policies apply to it with no `FORCE`
  statement at all.
- **One transaction per request.** The request's queries run inside a single transaction, and
  the application sets `app.current_org`, `app.current_user`, `app.current_role` and
  `app.current_session_token` on it with
  `set_config(name, value, true)`. The third argument is `is_local = true`, so the settings die
  with the transaction and cannot leak to the next request that borrows the pooled connection.
- **Policies are declared in Drizzle**, one org-isolation read predicate per tenant table, with
  writes to `surveys` and `questions` also needing the Manager role. `responses` and `answers`
  each carry two narrower policies instead: a read policy (a Manager selects every
  row in their own organisation, a Member only their own) and an insert policy (anyone, Manager
  included, inserts only for themselves).
- **The organisation comes from the session**, never from a body or a query string
  ([ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md)). The guard derives it, the
  interceptor sets it, and handlers receive it as a parameter decorator.
- **Application-layer scoping stays as a second layer.** Repositories are org-scoped by
  construction, so the common case does not depend on the policy, and the policy catches the
  query that forgets.
- **The isolation tests connect as `pulse_app`.** A test that connects as the owner passes
  whether or not a policy is correct, which is the trap the research note records.

Two queries run before a tenant context exists, and each gets a narrow, named exception rather
than a hole:

- **Session lookup.** Reading the `sessions` row happens before the organisation is known, so
  `sessions` carries a policy of its own: a row is visible only when its token hash equals
  `app.current_session_token`, set for that transaction from the cookie. The lookup is one query
  that reads one row, and it cannot list the table.
- **Dev user directory.** The dev sign-in picker lists seeded users across organisations, which
  is a deliberate cross-tenant read and the one the
  [ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md) trade-off records. It is served
  by a `SECURITY DEFINER` function in a `dev` schema, owned by `pulse_owner`. Migrations never
  grant it to `pulse_app` (0004 revokes the grant 0002 made); the seed grants it on development
  databases only when `AUTH_MODE=dev`, and the API refuses to start when the grants and the flag
  disagree. `users` itself stays org-scoped, so an
  ordinary request can never read another organisation's users.

## Consequences

### Positive

- The rule survives the mistake it is meant to survive: a repository method that forgets its
  `where` clause returns nothing rather than another organisation's rows.
- "No cross-member read" is a property of the database, not of an endpoint, and it is testable
  by connecting as the member's role and selecting.
- The isolation test is honest, because it runs as the role the policies apply to.
- The declaration lives in the schema next to the tables, so a reviewer can read the rule and
  the tables in one file, and the migration that creates the policy is reviewable in the diff.

### Trade-offs

- Two roles and a grant step. The migration path needs the owner, the API needs the app role,
  and the seed needs the owner (or a per-organisation session variable). Two connection strings
  are configured instead of one, and the failure mode of getting them the wrong way round is
  silent, so the spec states which is which and the API refuses to start if they are equal.
- Every query must run on the transaction handle, not the outer connection. A query that escapes
  to the pool runs with no settings, so every policy fails closed and it sees no rows at all.
  That is safe but a silent bug (an empty list, not an error), so the repository shape has to make
  the wrong thing hard to write. The spec makes the transaction handle the only thing a repository
  accepts.
- `drizzle-kit push` can disable RLS it does not know about
  ([issue 4948](https://github.com/drizzle-team/drizzle-orm/issues/4948), and
  [issue 4763](https://github.com/drizzle-team/drizzle-orm/issues/4763)). Migrations are applied
  with `migrate`, and `push` is not used against this database.
- RLS has edges worth stating: it does not cover `TRUNCATE`, referential integrity checks bypass
  it, and a superuser or a role with `BYPASSRLS` ignores it entirely. `pulse_app` must be
  neither, and the spec says so.
- A connection pool with transaction-local settings costs a transaction per request, which is
  more work than a plain pooled query. For this slice that is the point.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Application-layer scoping only | Cheaper and with no second role, but a single forgotten filter leaks silently and no test can prove the absence of that mistake across the whole codebase. It stays as a second layer rather than as the mechanism. |
| `FORCE ROW LEVEL SECURITY` on the owner, with one role | It closes the owner hole without a second role, but it moves the cost onto the seed (which must set the session variable per organisation) and onto `pg_dump`, which needs `--enable-row-security` or a `BYPASSRLS` role. The non-owner role is the production answer and leaves the door open to adding `FORCE` later as belt and braces. |
| Row policies for the organisation only, member access in the application layer | The member-level predicate is one extra clause on the same table, and the brief makes a claim about member isolation. Leaving it in code means the claim is only as good as the endpoint. |
| Neon's `crudPolicy`, `authenticatedRole` and `authUid` helpers | They depend on Neon's platform roles and its `auth.user_id()` function, so they are not portable to a local PostgreSQL. `pgPolicy` and `pgRole` are the general-purpose pieces. |
| A session variable holding the whole session row, set by the guard | It puts the tenant identity in the connection state before any policy checks it, so a mistake in the guard becomes a cross-tenant read with no second opinion. Deriving the tenant from a policy-checked row is the stronger shape. |
| Excluding `sessions` from RLS as an auth table | It reads as pragmatic, but it makes every session row readable by the application role, so a single query bug exposes every live session. The token-hash policy is one predicate and removes the hole. |

## Revisions

- **2026-09-27.** Brought the text in line with the code. The grants listed here were wider than
  migration 0001 makes them. A query on the pool sees no rows, not every row, because the policies
  fail closed. The dev functions are no longer granted by a migration. And the `responses` rule
  was one combined policy whose `WITH CHECK` let a Manager insert a response for another user;
  migration 0005 split it (and the `answers` policy) into a read policy and an own-row insert
  policy. The original decision only asked that a Member insert for themselves; the split extends
  that to Managers, because a response is always the caller's own answer. Migration 0006 did the
  same for `surveys` and `questions`: the organisation reads them, and only a Manager writes one,
  where before any role in the organisation could at the database level.
