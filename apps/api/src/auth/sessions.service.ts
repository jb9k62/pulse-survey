import {
  Inject,
  Injectable,
  type CookieSerializeOptions,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Organisation, Role, SessionState } from '@pulse/contracts';
import type { AppConfig } from '../config.js';
import { DB, type Db, type TenantTx } from '../db/db.module.js';
import { organisations, sessions, users } from '../db/schema.js';

// Contract section 5.4: the API picks the cookie name, uses it for setCookie and for the
// hand-parsed Cookie header, and keeps it in one place. Nothing else may hardcode it.
export const SESSION_COOKIE = 'pulse_session';

/** The signed-in caller, resolved from the session row. The tenant context comes from here. */
export interface Principal {
  userId: string;
  name: string;
  role: Role;
  organisation: Organisation;
  tokenHash: string;
}

export function sessionCookieOptions(
  config: AppConfig,
): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // Nest's maxAge is in seconds. `secure` must be false locally, or the browser drops
    // the cookie over plain HTTP.
    maxAge: config.sessionTtlHours * 3600,
    secure: !config.isDevelopment,
  };
}

/** 256 random bits, base64url, no padding, so the hand parser needs no decoding. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 64 lowercase hex characters, matching `sessions_token_hash_check`. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Server-side sessions (ADR-0002): the cookie holds an opaque random token, the database
 * holds only its SHA-256 hash, and every request resolves the hash back to a user. Sessions
 * are created only by the dev sign-in path (src/dev/dev.service.ts).
 */
@Injectable()
export class SessionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Resolve a raw cookie token to a principal, or `null`. This is where the tenant is
   * derived: the organisation and role come from rows read under RLS, never from the
   * request. See the RLS overview at the top of src/db/schema.ts.
   *
   * No tenant is known yet, so each setting is set only when the step before has earned
   * it, and each read works only because of the setting just before it:
   * 1. `app.current_session_token` = the hash, so sessions_select_own_token shows this one
   *    session row (and no other).
   * 2. `app.current_user` = the session's user, so the self branch of
   *    users_select_self_or_org shows that one user row.
   * 3. `app.current_org` = the user's organisation, so organisations_select_own shows it.
   * An unknown token finds no row. An expired session or a deactivated user is deleted in
   * this same transaction (sessions_delete_own_token) and returns `null`: return, never
   * throw, so the delete commits. The guard throws the 401 after the commit.
   */
  async resolve(rawToken: string): Promise<Principal | null> {
    const tokenHash = hashToken(rawToken);

    // Its own short transaction on the pool, separate from the request transaction the
    // interceptor opens later, because guards run before interceptors. Its settings are
    // transaction-local too, so they end with it; the interceptor sets them again.
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.current_session_token', ${tokenHash}, true)`,
      );

      const [session] = await tx
        .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);

      if (!session) {
        return null;
      }

      if (session.expiresAt.getTime() <= Date.now()) {
        await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
        return null;
      }

      await tx.execute(
        sql`select set_config('app.current_user', ${session.userId}, true)`,
      );

      const [user] = await tx
        .select({
          id: users.id,
          name: users.name,
          role: users.role,
          organisationId: users.organisationId,
          deactivatedAt: users.deactivatedAt,
        })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (
        !user ||
        (user.deactivatedAt !== null &&
          user.deactivatedAt.getTime() <= Date.now())
      ) {
        await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
        return null;
      }

      await tx.execute(
        sql`select set_config('app.current_org', ${user.organisationId}, true)`,
      );

      const [organisation] = await tx
        .select({ id: organisations.id, name: organisations.name })
        .from(organisations)
        .where(eq(organisations.id, user.organisationId))
        .limit(1);

      if (!organisation) {
        await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
        return null;
      }

      return {
        userId: user.id,
        name: user.name,
        role: user.role,
        organisation: { id: organisation.id, name: organisation.name },
        tokenHash,
      };
    });
  }

  /**
   * Delete the caller's session row. Must run on the request transaction, because
   * `app.current_session_token` is transaction-local and sessions_delete_own_token needs
   * it set. The interceptor sets it from the principal.
   */
  async logout(principal: Principal, tx: TenantTx): Promise<number> {
    const deleted = await tx
      .delete(sessions)
      .where(eq(sessions.tokenHash, principal.tokenHash))
      .returning({ id: sessions.id });
    return deleted.length;
  }

  state(principal: Principal | null, devSignIn: boolean): SessionState {
    if (principal === null) {
      return {
        signedIn: false,
        user: null,
        organisation: null,
        role: null,
        devSignIn,
      };
    }
    return {
      signedIn: true,
      user: { id: principal.userId, name: principal.name },
      organisation: principal.organisation,
      role: principal.role,
      devSignIn,
    };
  }
}
