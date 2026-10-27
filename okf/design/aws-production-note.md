---
type: Architecture
title: "Production readiness on AWS: a design note"
description: "The design-only answer to requirement 6: how the API, PostgreSQL and the static SPA would run on AWS, how an organisation logo would be stored and served cheaply and securely, and the tenancy, security and scaling points to handle first."
tags: [aws, deployment, storage, security, scaling]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: requirements.md
    title: Section 6, the three questions
  - resource: okf/pulse-surveys/architecture.md
  - resource: okf/pulse-surveys/domain-model.md
  - resource: okf/adr/0005-rls-with-a-non-owner-app-role.md
  - resource: okf/adr/0007-no-production-sign-in.md
  - resource: apps/api/src/config.ts
  - resource: apps/api/src/auth/sessions.service.ts
  - resource: apps/web/vite.config.ts
  - resource: package.json
---

# Production readiness on AWS: a design note

This is the design-only answer to requirement 6. Nothing described below exists in the repository:
there is no Dockerfile, no infrastructure code, no CI, no object storage client, no logo upload route
and no `logo` column in the schema. What follows is what would change, and in what order, written
against the choices this codebase actually made.

## What runs today

| Piece | How it runs now |
| --- | --- |
| API | `npm run build` writes `apps/api/dist`, and `start:prod` runs `node dist/main`. It listens on `API_PORT` (3000) and prefixes every route with `/api`. |
| Database | PostgreSQL 18.6 in Docker Compose. `pulse_owner` owns the schema and runs migrations and the seed; the API connects as `pulse_app`, which owns nothing and is subject to the eight row-level security policies. `apps/api/src/config.ts` refuses to start if that role is a superuser, has `BYPASSRLS` or owns a table. |
| Front end | `npm run build -w apps/web` writes `apps/web/dist` as static files. It is a client-only SPA (single-page application), and in development Vite proxies `/api` to the API so every call is same-origin. |
| Sessions | An opaque token in the `pulse_session` httpOnly cookie; only its SHA-256 hash is stored in `sessions`. `SESSION_TTL_HOURS` sets the TTL (time to live), and the cookie is `secure` unless `NODE_ENV` is `development` or `test`. |

## Deployment

The API image is built from `npm run build` and runs `node dist/main`, pushed to ECR (Elastic Container Registry, AWS's private image
store) and run on ECS (Elastic Container Service) Fargate, which runs containers without servers to
manage, behind an Application Load Balancer (ALB). App Runner, a simpler managed container service,
is the cheaper alternative when there is no need for an ALB. The database is RDS (Relational Database
Service, managed PostgreSQL) in private subnets with TLS (Transport Layer Security, encryption in
transit) required. The two
roles are created the way `apps/api/db/bootstrap.sql` does it, and the app role is never
`rds_superuser` and never has `BYPASSRLS`, which is exactly the invariant the API asserts on every
boot. Migrations run as a separate one-off task using `drizzle-kit migrate` and
`DATABASE_URL_OWNER`, before the new API revision is rolled out; `drizzle-kit push` stays banned.

The front end needs no server because there is no server rendering. It goes to a private S3 (Simple Storage Service,
AWS object storage) bucket served by CloudFront (AWS's CDN, or content delivery network) with Origin
Access Control (OAC), which lets only CloudFront read the bucket.

One origin matters. CloudFront's default behaviour points at S3, and `/api/*` points at the ALB,
forwarding the `Cookie` header and caching nothing on that behaviour. That keeps the same-origin
property the Vite proxy gives locally: a first-party cookie, no CORS (Cross-Origin Resource Sharing, the
browser rules for calls to another domain), no `SameSite=None`. Two
hostnames would force the CORS work and the cross-site cookie work, which is why they are not the
default.

Sessions are database rows. Any task can validate any session, so there are no sticky sessions:
scale the tasks out and any of them can answer. This is a direct consequence of
[ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md) and worth naming.

## Organisation logo storage and serving

The goal is that the backend carries no image bandwidth and no image cost, while access stays
secure. Store the object key, not a URL: a `logo_key` column on `organisations` in a new migration,
with a policy and a grant like every other table. None of this exists yet.

The bucket is private, with Block Public Access on and server-side encryption, either
SSE-S3 (keys managed by S3) or SSE-KMS (keys managed in KMS, the Key Management Service). Keys are
`organisations/<org-id>/logo/<sha256>.<ext>`, so the name changes with the content (cache busting)
and one organisation's objects group for lifecycle rules.

The API is the only writer, so validation cannot be bypassed. A Manager-only route validates the
content type and size, re-encodes or at least strips EXIF (photo metadata such as camera
and location), caps the dimensions, rejects SVG (an image format that can carry script), takes
the organisation id from the session and never from the body, then writes the key. This follows the
[tenant isolation](/pulse-surveys/architecture.md) rule that the organisation always comes from the
session.

Serving never streams the image through the API and never presigns on every page load. CloudFront
with OAC serves the bytes; the API only mints a short-lived signed URL (minutes) for the
organisation's own key and returns small JSON. CloudFront and S3 carry the bytes and the cost, the
ALB and the API task never see them, and because the object is immutable it caches for a long time.
The bucket stays private, the TTL (how long the URL works) stays short, signed URLs are not logged, and the key is derived
from the session, so one organisation can never be handed another's key. If a logo really must be
public, it gets a separate public prefix, never the private objects.

One honest tenancy sentence: S3 has no row-level security, so the signing route and the key layout
are the only things standing between two organisations' logos.

## Tenancy, security and scaling priorities

1. Keep the app role non-owner and non-`BYPASSRLS`, and assert it on the real RDS instance, not only
   at boot.
2. Keep the tenant context transaction-local. That is what makes a transaction-pooling proxy (RDS
   Proxy or PgBouncer, which share a few database connections between many requests) safe.
3. Every new table needs its policy and its grant in the same migration. A missing policy fails
   closed; a missing grant fails at runtime.
4. The organisation still comes only from the session, including the logo upload and signing routes.
5. Production sign-in is the gap. `AUTH_MODE` stays `off` in production, `AUTH_MODE=dev` unless `NODE_ENV` is `development` or `test`
   is a startup failure, and the production database must never be seeded (the seed grants the dev
   functions, and the API then refuses to start with `AUTH_MODE=off`). The first production step is an identity provider
   (Cognito, AWS's user sign-in service, or any OIDC provider, where OIDC is OpenID Connect, the
   standard sign-in protocol) replacing the two dev routes, keeping the `sessions` table and the
   guard. The dev picker must never be switched on to make a deployed demo work
   ([ADR-0007](/adr/0007-no-production-sign-in.md)).
6. Revoke `EXECUTE` on `dev.list_users()` and `dev.create_session()` when the flag is off. It is
   unconditional today and is an open TODO.
7. TLS at every hop, secrets in Secrets Manager or SSM (Systems Manager)
   Parameter Store, and a short session TTL.
8. Least-privilege IAM (Identity and Access Management) permissions per task, with S3 write only under the logo prefix.
9. WAF (Web Application Firewall) in front of CloudFront, rate limits on the sign-in and logo routes, and no personal data in
   logs.
10. Scaling: the API is stateless, so start at two tasks for availability. The database is the first
    bottleneck, and the hot paths already have indexes (`sessions_token_hash_key`,
    `responses_survey_week_idx`, `responses_org_week_idx`).
11. Read replicas only when a read path needs one, and remember a replica is another place the
    tenant context must be set. Weekly summaries are bounded aggregates, so a nightly rollup beats a
    wider index.
12. Static assets and logos never touch the API, which is the biggest cost lever.

## What I would not do yet

Multi-region, Kubernetes, microservices, a separate read model, or a cache in front of the API: none
of these is asked for, there is no traffic to justify any of them, and each one adds another place
for the tenant rule to be forgotten.
