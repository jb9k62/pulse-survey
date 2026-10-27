---
okf_version: "0.2"
---

# Pulse Surveys

Architecture, contracts, and decisions for Pulse Surveys, in
[Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
Start at the overview and follow links down to the detail you need.

## Application

* [Guided tour](/pulse-surveys/explainer.md) - start here: the long-form walk through the app,
  the stack, the tenant isolation mechanism and the client, with a self-check quiz
* [Guided tour: the Nest request pipeline](/pulse-surveys/nest-explainer.md) - the second tour:
  guards, the interceptor, pipes and the filter, and how the request transaction reaches every
  query, with a widget on memory and the connection pool
* [Overview](/pulse-surveys/overview.md) - what the service does, the rules it must keep, and
  what it leaves out
* [Data model](/pulse-surveys/domain-model.md) - the seven tables, the constraints that carry the
  business rules, the week function and the seed
* [Tenant isolation](/pulse-surveys/architecture.md) - the two database roles, the eight row-level
  policies, the per-request tenant context, the repository layout and the test plan
* [API surface](/pulse-surveys/api.md) - routes and roles, the DTO rules, the summary maths, the
  error contract and session mechanics
* [Front end](/pulse-surveys/frontend.md) - the five screen states of the client-only SPA, the two
  flows and the CSS plan

## Design

* [Spec: multi-tenant pulse surveys](/design/spec.md) - the plan of record: what to build, in what
  order, the rules that must hold and the definition of done
* [Plan: interactive widgets for the guided tour](/design/explainer-widgets.md) - the React
  micro-worlds in the viewer, and why they run the app's own code
* [Contract: tables, endpoints, fields, environment and scripts](/design/contract.md) - the frozen
  shapes every later slice must match, with the contract rulings where a concept is silent
* [Tenant isolation: what Drizzle and Nest actually give us](/design/tenant-isolation-options.md) - what the
  pinned versions do for row-level security, the three gaps they leave, and the application-layer plumbing
  that closes them
* [The problem space: multi-tenant pulse surveys](/design/multi-tenant-problem-space.md) - the happy path,
  the edge cases, where the complexity actually sits, and what the smallest honest slice looks like
* [Production readiness on AWS](/design/aws-production-note.md) - the design-only answer to requirement 6:
  deployment, logo storage and serving, and the first tenancy, security and scaling points

## Demo

* [Demo script](/demo/demo.md) - the 5 to 10 minute recorded walkthrough: the app live, how it was
  built, how AI was directed and checked, row-level security, the survey week and the scope cuts

## Decisions

* [Decision records](/adr/readme.md) - what an ADR is, the decisions recorded so far, and how to add one
* [Keep the design in an OKF bundle](/adr/0001-keep-design-in-okf-bundle.md) - why design depth lives here
* [Dev sign-in with server-side sessions](/adr/0002-dev-sign-in-with-server-side-sessions.md) - how the user and organisation are identified locally, and why the picker is gated to development
* [Local PostgreSQL with Docker Compose](/adr/0003-local-postgres-with-docker-compose.md) - the pinned image, the volume path that changed in 18, and the health check
* [A week is a calendar week in UTC](/adr/0004-calendar-week-in-utc.md) - the week boundary, which decides the column, the constraint and the summary
* [Row-level security with a non-owner application role](/adr/0005-rls-with-a-non-owner-app-role.md) - the isolation mechanism, the two roles, and the queries that cannot wait for a tenant context
* [Zod at the API edge](/adr/0006-zod-at-the-api-edge.md) - one schema library for DTOs, query parameters and config, run by the pipe Nest 12 ships
* [No production sign-in](/adr/0007-no-production-sign-in.md) - why the only way to obtain a session is the gated dev route
* [Shared contracts package](/adr/0008-shared-contracts-package.md) - why the request and response shapes live once, as Zod schemas used by both apps
* [ADR template](/adr/template.md) - starting point for a new record

## Viewer

`npm run okf:validate` checks the bundle against the spec (frontmatter and links). `npm run okf:view` also writes `okf/viz.html`
(gitignored): a concept graph beside a reading pane. Open it in a browser; its libraries load
from a CDN. The reading pane renders GitHub-style callouts (`> [!definition] Title`) and a
`quiz` fenced block as click-to-check questions, and a `widget` fenced block as one of the React
widgets in `packages/okf-widgets` (built first by `npm run okf:view`), beside the usual markdown,
tables, syntax highlighting and Mermaid diagrams.

Update history: [log.md](/log.md).
