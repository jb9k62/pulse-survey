import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { defer, firstValueFrom, from, type Observable } from 'rxjs';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { DB, type Db } from '../db/db.module.js';

/**
 * Open exactly one tenant transaction per request, public routes included, and set the
 * four `app.current_*` settings on it from the principal the auth guard resolved. This is
 * the step that hands the tenant context to the RLS policies; see the RLS overview at the
 * top of src/db/schema.ts.
 *
 * Nest runs guards before interceptors and pipes inside them
 * (references/nest/packages/core/router/router-execution-context.ts), so the principal is
 * already on the request here, and body validation errors roll this transaction back.
 * Absent values are `''`, which `nullif(..., '')` in `tenant-settings.ts` turns into NULL,
 * so a request with no session sees no tenant rows.
 *
 * `defer` delays subscribing to the handler until the transaction is open. A handler error
 * rejects, the transaction rolls back, and the error reaches the filter. The handler must
 * finish (`firstValueFrom`) before the callback returns, or its queries would run after
 * the commit.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(@Inject(DB) private readonly db: Db) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();

    return defer(() =>
      from(
        this.db.transaction(async (tx) => {
          const principal = request.principal ?? null;
          const org = principal?.organisation.id ?? '';
          const user = principal?.userId ?? '';
          const role = principal?.role ?? '';
          const token = principal?.tokenHash ?? '';

          // One round trip. The values are bind parameters, not string-built SQL. is_local =
          // true scopes them to this transaction, so they cannot leak to the next request
          // that borrows this pooled connection. The session token is set as well so logout
          // can delete its own row under sessions_delete_own_token.
          await tx.execute(
            sql`select set_config('app.current_org', ${org}, true), set_config('app.current_user', ${user}, true), set_config('app.current_role', ${role}, true), set_config('app.current_session_token', ${token}, true)`,
          );

          request.tx = tx;
          return firstValueFrom(next.handle());
        }),
      ),
    );
  }
}
