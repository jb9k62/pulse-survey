---
type: Architectural Decision
title: "ADR-0003: Local PostgreSQL with Docker Compose"
description: "How the database runs locally: one Docker Compose service on the official postgres image, pinned to the current stable release 18.6, with a named volume and a health check."
tags: [database, postgresql, docker, local-development, adr]
generated: { by: claude-opus-5-5, at: 2026-09-25 }
verified: { by: "human:Jordan Hunt", at: 2026-09-26 }
sources:
  - resource: requirements.md
    title: Sections 2.3 and 5.1, run locally with no paid cloud service
  - resource: https://www.postgresql.org/versions.json
    title: PostgreSQL release list, 18 is current (latest minor 18.6, end of life 2030-11-14)
  - resource: https://github.com/docker-library/official-images/blob/master/library/postgres
    title: Official image manifest, where 18.6, 18 and latest point at the same trixie build
  - resource: https://github.com/docker-library/postgres/blob/e00e1bd34ec5c8a8e7ad89b273b3d42efaf6d5bc/18/trixie/Dockerfile
    title: The 18 Dockerfile, with the new PGDATA and VOLUME paths
  - resource: https://github.com/docker-library/docs/blob/master/postgres/content.md
    title: Image docs, the PGDATA change in 18 and the environment variables
---

# ADR-0003: Local PostgreSQL with Docker Compose

- **Status:** accepted
- **Date:** 2026-09-25
- **Deciders:** Jordan Hunt

## Context

The stack fixes PostgreSQL as the database. The app must run locally with no paid cloud service
(section 2.3), and the README must give one command or a few short steps to run it (section 5.1).
Until now the README said "PostgreSQL, running locally or in Docker", which leaves a reviewer to
pick a version, create a database and a user, and hope that it matches what the tests ran on.

A decision is needed now because the schema, the migrations and the isolation tests all need a
database, and row-level security behaviour (see
[Tenant isolation](/design/tenant-isolation-options.md)) depends on the server version and on
which role connects.

Research, on 2026-09-25:

- PostgreSQL 18 is the current major (first released 2025-09-25, supported until 2030-11-14).
  The latest minor is 18.6. Version 19 is in beta (`19beta4`) and is not stable.
- The official image publishes `18.6`, `18` and `latest` as the same Debian trixie build.
- **Version 18 moved the data directory.** `PGDATA` is now `/var/lib/postgresql/18/docker` and
  the declared `VOLUME` is `/var/lib/postgresql`, not `/var/lib/postgresql/data` as in 17 and
  older. A volume mounted at the old path on 18 does not hold the data, so it silently fails to
  persist. Most tutorials still show the old path.
- The image refuses to start without `POSTGRES_PASSWORD` unless the auth method is `trust`, and
  uses `scram-sha-256` for host connections by default.
- Compose now prefers a file named `compose.yaml`, and the top-level `version` key is obsolete.

## Decision

We will run PostgreSQL locally as a single Docker Compose service, `db`, in `compose.yaml` at the
repository root, on the official image pinned to `postgres:18.6`.

The shape:

- Image `postgres:18.6`: the current stable minor, pinned so every machine runs the same server.
- A named volume, `pgdata`, mounted at `/var/lib/postgresql` (the version 18 path), so data
  survives `docker compose down` and is removed only by `docker compose down -v`.
- The port is published on `127.0.0.1` only, so the dev database is not reachable from the
  network. The host port comes from `POSTGRES_PORT` and defaults to 5432.
- The user, password and database name come from `.env`, with local defaults
  (`pulse` / `pulse` / `pulse`) so `docker compose up` works on a fresh clone. `.env.example`
  documents them and the matching `DATABASE_URL`. These are local development values, not
  secrets. Production credentials never live in this file (see the AWS note in `SOLUTION.md`).
- A health check runs `pg_isready` against the configured user and database, so
  `docker compose up --wait` returns only when the server accepts connections.
- `npm run db:up`, `db:down` and `db:psql` wrap the three commands a reviewer needs.
- Only the database runs in Compose. The API and the React app run on the host with `npm`, so
  file watching and debugging stay simple.

## Consequences

### Positive

- One command gives every reviewer and every test run the same server version and settings.
- No local PostgreSQL install is needed, and nothing is left on the host after `down -v`.
- Pinning the minor makes test results reproducible, and the version appears in the diff when it
  changes.
- The health check removes the race where migrations run before the server is ready.
- Binding to `127.0.0.1` keeps a weak dev password from being exposed on a shared network.

### Trade-offs

- Docker becomes a prerequisite. Someone without Docker can still point `DATABASE_URL` at their
  own PostgreSQL 18, but that path is not tested.
- The pinned minor does not update itself. Security fixes arrive only when someone bumps the tag.
  Bumping within 18 is safe on the same volume; moving to 19 needs `pg_upgrade` or a fresh volume.
- The image connects as the superuser named in `POSTGRES_USER`. If the tenant isolation ADR
  chooses row-level security, the app must connect as a separate non-owner role, which an init
  script or a migration will create. That is deferred to that ADR rather than guessed here.
- Port 5432 may already be taken on a developer machine. `POSTGRES_PORT` in `.env` moves it.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Ask reviewers to install PostgreSQL themselves | Version and setup drift between machines, and more steps than section 5.1 allows. |
| `postgres:latest` or the floating `postgres:18` tag | Unpinned: a pull on a different day can give a different server, and the change never shows in the diff. |
| Pin by image digest as well as tag | The strongest pin, but every minor bump then needs a digest lookup. The tag is enough for a local dev database. |
| `postgres:18.6-alpine` | Smaller, but uses musl, whose locale and collation behaviour differs from the glibc build that managed PostgreSQL services run. The Debian image is closer to production. |
| `postgres:19beta4` | Not a stable release. |
| Run the API and the React app in Compose too | More moving parts and slower reloads for no gain in a small slice. Can be added later for the demo if needed. |
| An embedded or in-memory PostgreSQL for tests (for example pglite or pg-mem) | Does not match the real server, and row-level security and constraint behaviour are exactly what the tests must prove. |
