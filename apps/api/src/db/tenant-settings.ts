import { sql } from 'drizzle-orm';

/**
 * The SQL fragments every RLS policy in schema.ts uses to read the tenant context. See the
 * RLS overview at the top of src/db/schema.ts for how the settings get set per request.
 *
 * `current_setting(name, true)` returns NULL instead of raising when the setting was never
 * set. The values are set with `set_config(name, value, true)`: is_local = true, so each
 * one dies with its transaction.
 *
 * Why `nullif(..., '')`: once a connection has run a transaction-local `set_config` for a
 * name, that name reads '' (not NULL) after the transaction ends, so a reused pooled
 * connection sees ''. The interceptor also sets '' on purpose for a public route. Without
 * nullif, ''::uuid raises SQLSTATE 22P02 and the query errors; with it the value is NULL,
 * `col = NULL` is never true, and the policy fails closed. The uuid cast is needed because
 * current_setting returns text and PostgreSQL has no uuid = text operator. Migration 0003
 * added nullif to the policies that 0000 created without it.
 *
 * appRole and appSessionToken need no nullif: they are compared as text, and '' matches
 * neither 'manager' nor a 64-character hex hash (sessions_token_hash_check).
 */

export const appOrg = sql`nullif(current_setting('app.current_org', true), '')::uuid`;
export const appUser = sql`nullif(current_setting('app.current_user', true), '')::uuid`;
export const appRole = sql`current_setting('app.current_role', true)`;
export const appSessionToken = sql`current_setting('app.current_session_token', true)`;
