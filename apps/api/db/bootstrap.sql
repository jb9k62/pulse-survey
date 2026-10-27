-- Database bootstrap for local development.
--
-- Run through `npm run db:bootstrap`, which connects as the Compose superuser to
-- the POSTGRES_DB database and passes three psql variables: `db_name` (POSTGRES_DB),
-- `owner_password` and `app_password` (both the value of POSTGRES_PASSWORD). This file is idempotent
-- and never contains a password.
--
-- The `\gexec` steps each return exactly one statement in one column because psql
-- executes every column of every returned row, and it does not interpolate
-- `:variables` inside dollar-quoted strings.
--
-- The two roles are the base of the row-level security model. The full picture is the
-- RLS overview at the top of apps/api/src/db/schema.ts.

\set ON_ERROR_STOP on

-- pulse_owner: owns the public schema, runs migrations and the seed. The tables the
-- migrations create belong to it, and PostgreSQL exempts a table's owner from that table's
-- policies, so the API must never connect as this role.
SELECT format(
  'CREATE ROLE pulse_owner LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
  :'owner_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulse_owner')
\gexec

-- Re-asserted on every run, so a role created earlier or changed by hand gets the
-- current password and attributes back.
ALTER ROLE pulse_owner WITH LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- pulse_app: the API connection. It owns no table, is not a superuser and has no
-- BYPASSRLS, so every policy applies to it without FORCE ROW LEVEL SECURITY. It gets no
-- privileges here: migration 0001 grants the verbs it needs. The API refuses to start if
-- this role can bypass RLS (assertDatabaseInvariants in apps/api/src/config.ts).
SELECT format(
  'CREATE ROLE pulse_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulse_app')
\gexec

ALTER ROLE pulse_app WITH LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- The development database belongs to pulse_owner, so migrations and the seed run
-- as the owner while the API connects as pulse_app. The name follows POSTGRES_DB.
ALTER DATABASE :"db_name" OWNER TO pulse_owner;
ALTER SCHEMA public OWNER TO pulse_owner;

-- The test database, owned by pulse_owner as well. CREATE DATABASE has no IF NOT
-- EXISTS, so the existence check goes through \gexec.
SELECT 'CREATE DATABASE pulse_test OWNER pulse_owner'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'pulse_test')
\gexec

ALTER DATABASE pulse_test OWNER TO pulse_owner;
