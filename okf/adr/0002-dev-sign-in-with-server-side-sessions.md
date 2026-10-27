---
type: Architectural Decision
title: "ADR-0002: Dev sign-in with server-side sessions"
description: "How the current user and organisation are identified locally: a seeded user picker, gated to development, backed by an opaque session cookie and a row in the database."
tags: [auth, sessions, cookies, multi-tenancy, security, adr]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-25 }
sources:
  - resource: requirements.md
    title: Sections 2.3, 2.6, 4.1.7, 4.1.8, 4.2.2 and 5.3
  - resource: references/nest/integration/cookies/e2e/cookies.spec.ts
    title: NestJS 12.1.0 cookie integration suite, the tested shape of setCookie and clearCookie
  - resource: references/nest/packages/common/interfaces/http/cookie-options.interface.ts
    title: CookiesOptions and CookieSerializeOptions, including maxAge in seconds
  - resource: references/nest/sample/19-auth-jwt/src/auth/auth.guard.ts
    title: The global guard shape, with a Reflector opt-out marker
  - resource: references/nest/packages/core/constants.ts
    title: APP_GUARD, the token that registers a guard globally
  - resource: okf/design/tenant-isolation-options.md
    title: The isolation note this decision feeds into
---

# ADR-0002: Dev sign-in with server-side sessions

- **Status:** accepted
- **Date:** 2026-09-25
- **Deciders:** Jordan Hunt

## Context

The requirements ask for a local-friendly way to identify the current user and organisation,
and name three acceptable shapes: a simple token, a session, or a header (section 4.2.2).
They also say a simple local "log in" is fine, for example picking a seeded user (section
5.3.3), while an organisation must never reach another organisation's data (sections 2.6 and
4.1.7). No external identity provider and no paid service are allowed (section 2.3).

The proposal under review was: no credentials at all. The React app lists every seeded user in
every organisation, and the visitor becomes whichever one they pick, until they log out. A
cookie, backed by a row in the database, keeps the session alive.

Two corrections to how that proposal was framed:

- **"Auth-less" is the wrong name.** There is authentication here, and a session to keep.
  What is missing is the credential, not the authentication. The honest name is
  **credential-less dev sign-in**: a seeded user picker plus a real server-side session.
  Using "auth-less" invites the reader to think there is no session layer, which is the
  opposite of what is being built.
- **The picker needs a gate.** The requirements permit picking a seeded user so the demo can
  run, not a permanent unauthenticated path to become anyone. Without a gate, this ADR would
  be recording an impersonation backdoor as architecture.

### Requirement check

| Requirement | Does the proposal meet it? |
| --- | --- |
| 2.3 Runs locally, no external identity provider, no paid service | Yes. The picker is local and seeded. |
| 4.2.2 A local-friendly way to identify the user and organisation | Yes, and the session option is one the requirement names. |
| 5.3.3 Simple local "log in", for example picking a seeded user | Yes. This is exactly that, with the picker as its UI. |
| 2.6 and 4.1.7 One organisation must never reach another's data | Yes, **provided** the organisation is read from the session row and every query is scoped by it. The user directory is a dev-only sign-in affordance, not organisation data. See the trade-offs. |
| 4.1.4 Managers manage only their own organisation's surveys | Yes. The role and organisation both come from the session. |
| 4.1.8 Seed data with at least 2 organisations and both roles | Yes, and the picker makes the two organisations visible in the demo. |
| 5.3.1 The demo shows isolation across 2 organisations | Yes. Switch user, and the data changes. |

Verdict: the proposal meets the requirements, but only in the gated, server-side session form
described below. The ungated form does not, and is rejected as an alternative.

## Decision

We will identify the current user with a server-side session: a random opaque token in an
httpOnly cookie, matched to a `sessions` row that points at a seeded user. The organisation and
role are read from that row's user and from nowhere else. The seeded user picker is a
development-only affordance behind an explicit flag, and the API fails closed when the flag is
off.

The shape:

- Two routes are public only while the dev flag is on: `GET /dev/users` lists seeded users with
  their organisation and role, and `POST /dev/sessions` creates a session for one user id. Both
  return 404 when the flag is off, so a production build does not expose them at all.
- `POST /dev/sessions` writes one `sessions` row and sets the cookie.
- `DELETE /sessions` (logout) deletes the row server-side and clears the cookie. Clearing the
  cookie alone would leave a valid token in the database.
- The cookie carries only the token. It never carries the user id, the organisation id or the
  role. A cookie that carried those would let the client assert a tenant, which is the rule
  this project exists to keep.
- The token is 256 random bits. The database stores only its SHA-256 hash, and the guard
  compares hashes. A reader of the sessions table therefore cannot forge a token.
- Cookie attributes: `httpOnly`, `SameSite=Lax`, `Path=/`, a bounded `maxAge`, and `Secure`
  outside local development. Note that Nest's `maxAge` is in seconds, not milliseconds as
  Express' `res.cookie()` uses, which is a 1000x mistake waiting to happen.
- A global guard (`APP_GUARD`) resolves the cookie to a session row and attaches
  `{ userId, organisationId, role }` to the request. A `@Public()` marker exempts the dev
  routes and the health check. Every other route requires a session, so a new route is
  protected by default rather than by remembering to protect it.
- The organisation reaches handlers through a `@CurrentOrg()` parameter decorator, never
  through a body, a query string or a route param.
- The dev flag defaults to off when unset, and the application refuses to start when the flag
  is on and `NODE_ENV` is not `development` or `test` (amended 2026-09-26: it used to refuse only
  `production`, which failed open when `NODE_ENV` was unset). The database backs this up: only the
  dev seed grants the dev functions to the app role, only when the flag is on (it revokes them when
  the flag is off, and refuses to run outside development, amended 2026-09-27), and the API refuses
  to start when the grants disagree with the flag. Local development sets the flag in `.env`, which the README documents.
- The cookie is not signed. A signature proves that the server wrote a value, which matters for
  a cookie that carries claims. This cookie carries an opaque lookup key, so the database
  comparison is the check. If claims ever move into the cookie, signing becomes necessary.

NestJS 12 supports all of this without `cookie-parser`: the `cookies.secret` application option
builds a `CookieSigner`, `setCookie()` and `clearCookie()` live on the HTTP adapter, and
`@Cookies()` and `@SignedCookies()` read them. The pinned integration suite at
`references/nest/integration/cookies/e2e/cookies.spec.ts` is the tested shape to copy.

## Consequences

### Positive

- It meets section 4.2.2 with the session option the requirement names, and section 5.3.3
  directly.
- It is stronger than the header option it replaces. The organisation is derived server-side
  from a revocable row, so a client cannot assert which tenant it belongs to. A header carrying
  an organisation id would be precisely the pattern `AGENTS.md` forbids.
- Logout is real. Deleting the row means a leaked cookie stops working, which a signed
  stateless cookie cannot offer.
- The demo stays legible: pick a user, see that organisation's survey, switch, see the other.
  Logging in as a Manager and then a Member also makes the role difference visible without
  extra UI.
- `sessions` is ordinary data, so the isolation tests can create, expire and revoke sessions
  through the same repository the application uses.

### Trade-offs

- **Listing users across all organisations is a cross-tenant disclosure.** In production it
  would be a serious leak, and a strict reading of "one organisation must never access another
  organisation's data" could call it a breach. The position taken is that the rule guards
  organisation data (surveys, questions, responses, summaries), and that the directory is the
  seeded sign-in mechanism section 5.3.3 explicitly allows. The counter-argument is recorded
  here rather than hidden, because it is a fair reading and the assessor may raise it. What
  makes the position defensible is the gate: outside development the route does not exist.
- **The dev flag is now a security boundary.** If it defaults to on, the backdoor ships. It
  defaults to off and the app refuses to boot in production with it on, so the failure mode is
  a refused start rather than an open door.
- Two endpoints, a table and a guard, which is more than a header would have cost.
- Session rows need an expiry story. A `expiresAt` column plus a sweep, or a delete on read,
  where a header needed nothing.
- Anyone who can reach the dev server can become a Manager in any organisation. This does not
  weaken the isolation tests, which assert that a session for organisation A cannot read
  organisation B even when it knows the id, but it does mean the picker proves nothing about
  authorisation on its own. The tests are what prove isolation, not the demo.
- The picker shows only id, display name, organisation name and role. Anything more would widen
  the disclosure for no demo value.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Header carrying the user id, for example `X-User-Id` | The cheapest option, and the requirements allow it. Rejected because the tenant then arrives from the client, which is the rule this project is built to keep, and it offers no logout and no revocation. |
| Signed cookie carrying the user id, no sessions table | No table to sweep, but a leaked cookie cannot be revoked and the identity still travels from the client. |
| The picker with no dev flag, always on | The simplest demo, and it ships an unauthenticated impersonation path to production. Rejected: section 5.3.3 permits picking a seeded user for the demo, not a permanent way to become anyone. |
| Real password login with hashed passwords | It meets the letter of "no external identity provider", but it adds credential storage, hashing and reset flows the requirements do not ask for, and it makes the demo slower to run. |
| A JWT in a cookie, following `sample/19-auth-jwt` | A signing and verification path for a local demo, and stateless tokens cannot be revoked. The session row is less code and a better fit. |
| A signed session cookie instead of a hashed token | Signing an opaque lookup key adds a second comparison without adding a guarantee. Revisit if claims move into the cookie. |
