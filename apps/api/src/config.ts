import { z } from 'zod';
import { loadRootEnv } from './db/load-env.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

export type AuthMode = 'off' | 'dev';

export interface AppConfig {
  databaseUrlOwner: string;
  databaseUrlApp: string;
  authMode: AuthMode;
  devSignIn: boolean;
  sessionTtlHours: number;
  apiPort: number;
  /**
   * NODE_ENV is `development` or `test`. Anything else, including unset, is treated as
   * production: dev sign-in is refused and the cookie is `secure`. Failing closed means a
   * deployment that forgets NODE_ENV is still safe.
   */
  isDevelopment: boolean;
}

const DEVELOPMENT_ENVS: ReadonlySet<string> = new Set(['development', 'test']);

const envSchema = z.object({
  DATABASE_URL_OWNER: z.string().min(1),
  DATABASE_URL_APP: z.string().min(1),
  AUTH_MODE: z.enum(['off', 'dev']).default('off'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.string().optional(),
});

/**
 * Parse and validate the environment, then enforce the two checks that need no database:
 * the owner and app URLs must differ, and `AUTH_MODE=dev` needs a development NODE_ENV.
 * The database-side checks are `assertDatabaseInvariants` below.
 *
 * With no argument it loads the repo-root `.env` and parses `process.env`. With an
 * explicit object it parses exactly that object and does no file I/O, which is what the
 * unit tests use. drizzle-kit's own `dotenv/config` loads `.env` from the cwd
 * (`apps/api` under a workspace script), so the repo-root file has to be loaded here.
 */
export function loadConfig(env?: NodeJS.ProcessEnv): AppConfig {
  const source = env ?? (loadRootEnv(), process.env);

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  const data = parsed.data;

  const nodeEnv = data.NODE_ENV?.toLowerCase();
  const isDevelopment = nodeEnv !== undefined && DEVELOPMENT_ENVS.has(nodeEnv);

  // A cheap first check only: two different strings can still name the same role, which
  // is why assertDatabaseInvariants asks the database who the app connection really is.
  if (data.DATABASE_URL_OWNER === data.DATABASE_URL_APP) {
    throw new Error(
      'DATABASE_URL_OWNER and DATABASE_URL_APP must both be set and must differ. The API ' +
        'connects as the non-owner app role, or row-level security is bypassed.',
    );
  }

  if (data.AUTH_MODE === 'dev' && !isDevelopment) {
    throw new Error(
      'AUTH_MODE=dev needs NODE_ENV=development or NODE_ENV=test. Any other value, or none, ' +
        'is treated as production.',
    );
  }

  return {
    databaseUrlOwner: data.DATABASE_URL_OWNER,
    databaseUrlApp: data.DATABASE_URL_APP,
    authMode: data.AUTH_MODE,
    devSignIn: data.AUTH_MODE === 'dev',
    sessionTtlHours: data.SESSION_TTL_HOURS,
    apiPort: data.API_PORT,
    isDevelopment,
  };
}

/**
 * The narrow slice of a `pg` connection the invariant check needs. A `pg.Pool` is
 * structurally assignable, and a stub makes the check unit-testable without a database.
 */
export interface InvariantQuery {
  query: (text: string) => Promise<{ rows: readonly unknown[] }>;
}

// One round trip, as the connected role (current_user):
// - rolsuper, rolbypassrls: either one skips RLS outright.
// - owned_tables: an owner is exempt from RLS on its own tables, in any schema.
// - privileged_roles: roles current_user can SET ROLE to (pg_has_role 'MEMBER') that are
//   superuser, BYPASSRLS or own a table. Switching to one would skip RLS, so membership
//   is as bad as being that role.
// - dev_*: whether the dev sign-in functions are callable. to_regnamespace and
//   to_regprocedure return NULL for a missing object, the has_*_privilege calls then return
//   NULL, and coalesce makes that false, so the query works before migration 0002 too.
// `count(*)::int` matters: count is a bigint and `pg` returns a bigint as a string.
const DATABASE_INVARIANTS_SQL = `select
  r.rolsuper,
  r.rolbypassrls,
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where c.relowner = r.oid
      and c.relkind in ('r', 'p')
      and n.nspname not in ('pg_catalog', 'information_schema')) as owned_tables,
  (select coalesce(string_agg(m.rolname, ', ' order by m.rolname), '')
     from pg_roles m
    where m.oid <> r.oid
      and pg_has_role(r.oid, m.oid, 'MEMBER')
      and (m.rolsuper or m.rolbypassrls
           or exists (select 1 from pg_class c where c.relowner = m.oid and c.relkind in ('r', 'p')))
  ) as privileged_roles,
  coalesce(has_schema_privilege(r.oid, to_regnamespace('dev'), 'USAGE'), false) as dev_schema,
  coalesce(has_function_privilege(r.oid, to_regprocedure('dev.list_users()'), 'EXECUTE'), false)
    as dev_list_users,
  coalesce(has_function_privilege(r.oid, to_regprocedure('dev.create_session(uuid, text, timestamptz)'), 'EXECUTE'), false)
    as dev_create_session
from pg_roles r
where r.rolname = current_user`;

export interface InvariantRow {
  rolsuper: boolean | null;
  rolbypassrls: boolean | null;
  owned_tables: number | null;
  privileged_roles: string | null;
  dev_schema: boolean | null;
  dev_list_users: boolean | null;
  dev_create_session: boolean | null;
}

/**
 * The contract's database invariants, checked before the API listens (`main.ts`). This is
 * the check that makes the RLS model hold at runtime (see the RLS overview at the top of
 * src/db/schema.ts): the policies only bind a role that is not a superuser, has no
 * BYPASSRLS, owns no table and cannot SET ROLE to one that does, and nothing in the config
 * alone proves that about the role a URL logs in as.
 *
 * It also checks that the dev sign-in functions are callable exactly when
 * `AUTH_MODE=dev`. With `AUTH_MODE=off` any grant is refused, because the database, not
 * only the 404 in the guard, must keep the cross-tenant picker out of production.
 */
export async function assertDatabaseInvariants(
  db: InvariantQuery,
  options: { devSignIn: boolean },
): Promise<void> {
  const result = await db.query(DATABASE_INVARIANTS_SQL);
  const row = result.rows[0] as InvariantRow | undefined;
  if (!row) {
    throw new Error('Could not read the database role for the app connection.');
  }

  if (row.rolsuper === true) {
    throw new Error(
      'The app database connection is a superuser. Row-level security is bypassed.',
    );
  }
  if (row.rolbypassrls === true) {
    throw new Error(
      'The app database connection has BYPASSRLS. Row-level security is bypassed.',
    );
  }
  if (row.owned_tables !== 0) {
    throw new Error(
      `The app database connection owns ${String(row.owned_tables)} table(s). ` +
        'An owner is exempt from row-level security; the app must own no table.',
    );
  }
  if (row.privileged_roles) {
    throw new Error(
      `The app database connection is a member of ${row.privileged_roles}, which can bypass ` +
        'row-level security through SET ROLE. Revoke the membership.',
    );
  }

  const anyDevGrant =
    row.dev_schema === true ||
    row.dev_list_users === true ||
    row.dev_create_session === true;
  const allDevGrants =
    row.dev_schema === true &&
    row.dev_list_users === true &&
    row.dev_create_session === true;

  if (!options.devSignIn && anyDevGrant) {
    throw new Error(
      'AUTH_MODE is off but the app database role can call the dev sign-in functions. ' +
        'Revoke them (migration 0004 does), or set AUTH_MODE=dev on a development database.',
    );
  }
  if (options.devSignIn && !allDevGrants) {
    throw new Error(
      'AUTH_MODE=dev but the app database role cannot call the dev sign-in functions. ' +
        'Run npm run db:seed, which grants them on the development database.',
    );
  }
}
