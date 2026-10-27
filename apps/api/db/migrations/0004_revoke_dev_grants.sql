-- Custom SQL migration file, put your code below! ---- Migrations run in every environment, so they must not let pulse_app call the dev
-- SECURITY DEFINER functions (0002 did). The grants now live in src/db/dev-grants.ts,
-- which only the seed CLI and the test setup run. The API refuses to start when the
-- grants disagree with AUTH_MODE (assertDatabaseInvariants in src/config.ts).
REVOKE EXECUTE ON FUNCTION dev.list_users() FROM pulse_app;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION dev.create_session(uuid, text, timestamptz) FROM pulse_app;--> statement-breakpoint
REVOKE USAGE ON SCHEMA dev FROM pulse_app;
