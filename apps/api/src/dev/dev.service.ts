import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { roleSchema, type DevUser } from '@pulse/contracts';
import { hashToken, newSessionToken } from '../auth/sessions.service.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import type { TenantTx } from '../db/db.module.js';
import { unwrapPostgresError } from '../db/pg-errors.js';

type DevUserRow = {
  user_id: string;
  user_name: string;
  role: string;
  organisation_id: string;
  organisation_name: string;
};

export interface CreatedSession {
  token: string;
  user: DevUser;
}

/**
 * The dev sign-in picker's database work. Reached only through `@DevOnly()` routes, so it
 * never runs unless `AUTH_MODE=dev` (see "The dev exception" in the RLS overview at the top
 * of src/db/schema.ts).
 */
@Injectable()
export class DevService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /**
   * The deliberate cross-tenant read. `users` is org-scoped under RLS, so this goes through
   * the SECURITY DEFINER `dev.list_users()`, which pulse_app can call only on a database
   * where src/db/dev-grants.ts ran. Only active users are returned.
   */
  async listUsers(tx: TenantTx): Promise<DevUser[]> {
    const result = await tx.execute<DevUserRow>(
      sql`select * from dev.list_users()`,
    );
    return result.rows.map((row) => ({
      id: row.user_id,
      name: row.user_name,
      // `dev.list_users()` returns `role` as text, so check it rather than cast it.
      role: roleSchema.parse(row.role),
      organisation: { id: row.organisation_id, name: row.organisation_name },
    }));
  }

  /**
   * Create a session through the owner-run SECURITY DEFINER function, since pulse_app has
   * no INSERT on sessions. The function raises SQLSTATE P0002 for an unknown or deactivated
   * user, which is a 404 here, never a 400. It also deletes that user's expired sessions.
   * We do not call `SessionsService.resolve` afterwards: the row is uncommitted in this
   * transaction and a second pooled connection cannot see it.
   */
  async createSession(tx: TenantTx, userId: string): Promise<CreatedSession> {
    const token = newSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + this.config.sessionTtlHours * 3600_000,
    );

    try {
      await tx.execute(
        sql`select dev.create_session(${userId}::uuid, ${tokenHash}::text, ${expiresAt}::timestamptz)`,
      );
    } catch (error) {
      if (unwrapPostgresError(error)?.code === 'P0002') {
        throw new NotFoundException();
      }
      throw error;
    }

    const user = (await this.listUsers(tx)).find(
      (candidate) => candidate.id === userId,
    );
    if (!user) {
      throw new NotFoundException();
    }

    return { token, user };
  }
}
