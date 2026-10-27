---
type: Architectural Decision
title: "ADR-0007: No production sign-in in this slice"
description: "The session layer stays production-shaped, but the only way to obtain a session is the dev route, which is gated and absent when the flag is off."
tags: [auth, scope, sessions, adr]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: requirements.md
    title: Sections 2.3, 4.2.2 and 5.3.3
  - resource: okf/adr/0002-dev-sign-in-with-server-side-sessions.md
    title: The dev sign-in this decision builds on
  - resource: okf/adr/0005-rls-with-a-non-owner-app-role.md
    title: The isolation mechanism, which does not depend on how a session is created
---

# ADR-0007: No production sign-in in this slice

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Jordan Hunt

## Context

Requirement 2.3 rules out an external identity provider and any paid service, and requirement 5.3.3
allows a simple local sign-in such as picking a seeded user. [ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md)
built that: a seeded user picker behind a development flag, backed by an opaque token in an httpOnly
cookie and a revocable `sessions` row, with the organisation and role read from that row.

The question this record settles is whether the slice should also carry a real credential flow, so
that the application could be deployed and used by a stranger. The spec left it open.

## Decision

We will not build a production sign-in in this slice. The session layer stays exactly as ADR-0002
built it, and the only way to obtain a session is `POST /api/dev/sessions`, which returns `404` when
`AUTH_MODE` is `off` and is refused at startup in production.

## Consequences

### Positive

- Scope stays on the rules the brief is about: the week boundary, one response per active week,
  the tenant boundary and the summary maths.
- No credentials means no password storage, no reset flow, no lockout policy and no credential
  surface to get wrong. For a four-hour slice, a half-built credential flow would be the least
  defensible code in the repository.
- The part that is expensive to get right, the session layer, is already production-shaped:
  httpOnly cookie, an opaque token stored only as a hash, a row that can be revoked, an expiry, and
  a guard that treats an expired session or a deactivated user as no session. An identity provider
  later replaces the two dev routes and leaves everything else alone.

### Trade-offs

- **The deployed application has no way in.** With `AUTH_MODE=off` the picker and the session route
  do not exist, so this slice cannot be run as a public service. It is a demo and a portfolio
  artefact, and that is now a recorded decision rather than an oversight.
- The demo needs `AUTH_MODE=dev`, which the API refuses to start with unless `NODE_ENV` is
  `development` or `test`, and which needs grants that only the dev seed applies. Those two
  refusals are the guard against shipping the picker by accident.
- The one honest disclosure in ADR-0002 stands: the dev picker lists seeded users across
  organisations, which a strict reading of the isolation rule could call a breach. It stays gated,
  and its reasoning is unchanged by this decision.

## Alternatives considered

| Option | Why rejected |
|---|---|
| An OIDC provider (Auth0, Cognito, Entra) | Requirement 2.3 rules out an external identity provider, and the hosted tiers are paid services. Local Keycloak would satisfy "no paid service" but adds a container, a realm, a client and a redirect flow to a four-hour slice. |
| Email and password with a hash (argon2 or bcrypt) | The honest middle option, and still real work: password storage and policy, a reset flow that needs email, rate limiting, lockout, and a credential breach surface. No requirement asks for it, and doing it badly would be worse than not doing it. |
| A magic link or one-time code | Needs email delivery, which is either a paid service or a local mail catcher, so it fails requirement 2.3 or adds a moving part the demo does not need. |
| A signed stateless cookie, so no session table | Rejected in [ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md): it cannot be revoked, and it invites carrying the organisation in the cookie, which is exactly the assertion this project forbids. |
| Keeping the dev picker ungated so it doubles as the sign-in | Rejected in [ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md): the requirements permit a demo sign-in, not a permanent way to become any user. |
