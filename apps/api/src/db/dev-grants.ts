import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Let pulse_app call the dev sign-in functions: the one deliberate cross-tenant path (see
 * "The dev exception" in the RLS overview at the top of src/db/schema.ts).
 *
 * `dev.list_users()` and `dev.create_session(...)` (migration 0002) are SECURITY DEFINER,
 * so they run as their owner, pulse_owner, which RLS exempts. Whoever may call them can
 * list users of every organisation and mint a session for any active user. Migrations run
 * in every environment, so they never grant this (0004 revokes what 0002 granted). Only the
 * seed CLI (when AUTH_MODE=dev) and the test global setup call this function, and the API
 * refuses to start when the grants disagree with AUTH_MODE (`assertDatabaseInvariants` in
 * src/config.ts).
 *
 * Must run as the functions' owner (pulse_owner). Idempotent.
 */
export async function grantDevSignIn(db: NodePgDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`GRANT USAGE ON SCHEMA dev TO pulse_app`);
    await tx.execute(
      sql`GRANT EXECUTE ON FUNCTION dev.list_users() TO pulse_app`,
    );
    await tx.execute(
      sql`GRANT EXECUTE ON FUNCTION dev.create_session(uuid, text, timestamptz) TO pulse_app`,
    );
  });
}

/**
 * Undo `grantDevSignIn`, so a seeded database can run with AUTH_MODE=off. Must run as the
 * functions' owner (pulse_owner). Idempotent: revoking a privilege that was never granted is
 * a no-op.
 */
export async function revokeDevSignIn(db: NodePgDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`REVOKE EXECUTE ON FUNCTION dev.list_users() FROM pulse_app`,
    );
    await tx.execute(
      sql`REVOKE EXECUTE ON FUNCTION dev.create_session(uuid, text, timestamptz) FROM pulse_app`,
    );
    await tx.execute(sql`REVOKE USAGE ON SCHEMA dev FROM pulse_app`);
  });
}
