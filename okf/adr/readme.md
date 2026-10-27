---
type: Reference
title: Decision records
description: What an ADR is, the decisions recorded so far, and how to add one.
tags: [adr, architecture, decisions]
generated: { by: pi-coding-agent, at: 2026-09-25 }
---

# Decision records

An Architectural Decision Record (ADR) captures one significant decision: its context, the
choice, the alternatives rejected, and the consequences accepted. With ADRs, "why is it like
this?" never needs someone who was there. The format follows Michael Nygard's *Documenting
Architecture Decisions*.

## Recorded decisions

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](/adr/0001-keep-design-in-okf-bundle.md) | Keep the design in an OKF bundle, with `SOLUTION.md` as the short summary | Accepted |
| [0002](/adr/0002-dev-sign-in-with-server-side-sessions.md) | Dev sign-in: a seeded user picker behind a dev flag, backed by an opaque session cookie and a row in the database | Accepted |
| [0003](/adr/0003-local-postgres-with-docker-compose.md) | Run PostgreSQL locally in Docker Compose on the official `postgres:18.6` image, with a named volume and a health check | Accepted |
| [0004](/adr/0004-calendar-week-in-utc.md) | A week is an ISO 8601 calendar week in UTC, computed on the server and stored as a date on the response | Accepted |
| [0005](/adr/0005-rls-with-a-non-owner-app-role.md) | Tenant isolation by PostgreSQL row-level security, with the API connecting as a separate non-owner role and the tenant context set per transaction | Accepted |
| [0006](/adr/0006-zod-at-the-api-edge.md) | Zod 4 schemas validated by Nest's `StandardSchemaValidationPipe`, registered as an `APP_PIPE` provider | Accepted |
| [0007](/adr/0007-no-production-sign-in.md) | No production sign-in in this slice: the gated dev route is the only way to obtain a session | Accepted |
| [0008](/adr/0008-shared-contracts-package.md) | One shared `@pulse/contracts` package of Zod schemas for the API and the web app | Accepted |
| [0009](/adr/0009-per-organisation-timezone-for-the-week.md) | The week is an ISO calendar week in an IANA timezone stored on the organisation, with daylight saving left to PostgreSQL (refines 0004) | Proposed (working draft) |

The decisions this project still owes are the small ones the plan settles as it is written: the exact
endpoint list, the summary response shape, and the CSS approach. They are recorded in
`okf/design/spec.md` and the concepts beside it rather than as ADRs, because they are cheap to
reverse. Both decisions the spec left open were settled on 2026-09-26 (ADR-0006 and ADR-0007).

## Adding one

- Copy the [template](/adr/template.md) to `NNNN-short-title.md` and add it to the table above,
  linking the number (`0001`) to the new file.
- Record one decision, with at least one rejected alternative and why. Without alternatives, an
  ADR explains nothing.
- Keep it to about a page, written for a reader who doesn't share your context.
- Record choices that are costly to reverse or likely to be questioned (stack, module
  boundaries, data model, API contract), not every small one.
- Statuses: **proposed**, **accepted**, **superseded** (link the replacement), or
  **deprecated**. Update the status instead of rewriting history.
