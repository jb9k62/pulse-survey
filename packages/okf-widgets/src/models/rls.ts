/**
 * A model of the `responses_select_org` policy in apps/api/src/db/schema.ts and of the
 * settings the interceptor writes. The real policy runs in PostgreSQL; this mirrors its
 * predicate so a reader can flip the switches the real system does not let you flip.
 *
 *   USING organisation_id = appOrg AND (appRole = 'manager' OR user_id = appUser)
 *   appOrg  = nullif(current_setting('app.current_org', true), '')::uuid
 *   appUser = nullif(current_setting('app.current_user', true), '')::uuid
 */

export const ACME = '11111111-1111-4111-8111-111111111111';
export const BLUE_RIVER = '22222222-2222-4222-8222-222222222222';

export interface ResponseRow {
  id: string;
  organisationId: string;
  organisationName: string;
  userId: string;
  userName: string;
}

/** The three seeded responses of the current week (apps/api/src/db/fixtures.ts). */
export const RESPONSES: readonly ResponseRow[] = [
  {
    id: 'a4…01',
    organisationId: ACME,
    organisationName: 'Acme',
    userId: 'a1000000-0000-4000-8000-000000000003',
    userName: 'Acme Member Long Ago',
  },
  {
    id: 'a4…02',
    organisationId: ACME,
    organisationName: 'Acme',
    userId: 'a1000000-0000-4000-8000-000000000004',
    userName: 'Acme Member Mid Week',
  },
  {
    id: 'b4…01',
    organisationId: BLUE_RIVER,
    organisationName: 'Blue River',
    userId: 'b1000000-0000-4000-8000-000000000003',
    userName: 'Blue River Member Long Ago',
  },
];

export interface Caller {
  id: string;
  label: string;
  /** The four settings as the interceptor writes them. '' when there is no session. */
  org: string;
  user: string;
  role: '' | 'manager' | 'member';
}

export const CALLERS: readonly Caller[] = [
  {
    id: 'acme-manager',
    label: 'Acme Manager One',
    org: ACME,
    user: 'a1000000-0000-4000-8000-000000000001',
    role: 'manager',
  },
  {
    id: 'acme-member',
    label: 'Acme Member Long Ago',
    org: ACME,
    user: 'a1000000-0000-4000-8000-000000000003',
    role: 'member',
  },
  {
    id: 'acme-not-answered',
    label: 'Acme Member Not Answered',
    org: ACME,
    user: 'a1000000-0000-4000-8000-000000000007',
    role: 'member',
  },
  {
    id: 'blue-manager',
    label: 'Blue River Manager One',
    org: BLUE_RIVER,
    user: 'b1000000-0000-4000-8000-000000000001',
    role: 'manager',
  },
  {
    id: 'no-session',
    label: 'No session (a public route)',
    org: '',
    user: '',
    role: '',
  },
];

export interface Switches {
  /** Connect as pulse_owner, which owns the table and so skips its policies. */
  asOwner: boolean;
  /** Drop nullif(..., '') from appOrg and appUser, as migration 0000 first had it. */
  withoutNullif: boolean;
  /** Run the query without the repository's organisation filter. */
  forgetFilter: boolean;
}

export type RowFate =
  { kept: true; reason: string } | { kept: false; reason: string };

export type QueryResult =
  { kind: 'rows'; fates: RowFate[] } | { kind: 'error'; message: string };

/** What the SQL `nullif(x, '')::uuid` does with a setting. */
function asUuid(
  setting: string,
  withoutNullif: boolean,
): string | null | 'error' {
  if (setting !== '') return setting;
  return withoutNullif ? 'error' : null;
}

/** With no session there is no organisation to filter by, so the query has no where clause. */
export function hasFilter(caller: Caller, switches: Switches): boolean {
  return !switches.forgetFilter && caller.org !== '';
}

export function sqlFor(caller: Caller, switches: Switches): string {
  const filter = hasFilter(caller, switches)
    ? `\n  where organisation_id = '${caller.org}'`
    : '';
  return `select * from responses${filter};`;
}

export function runQuery(caller: Caller, switches: Switches): QueryResult {
  const filtered = (row: ResponseRow): boolean =>
    !hasFilter(caller, switches) || row.organisationId === caller.org;

  if (switches.asOwner) {
    return {
      kind: 'rows',
      fates: RESPONSES.map((row) =>
        filtered(row)
          ? { kept: true, reason: 'owner: no policy applied' }
          : { kept: false, reason: 'the where clause' },
      ),
    };
  }

  const org = asUuid(caller.org, switches.withoutNullif);
  const user = asUuid(caller.user, switches.withoutNullif);
  if (org === 'error' || user === 'error') {
    return {
      kind: 'error',
      message: 'ERROR: invalid input syntax for type uuid: "" (SQLSTATE 22P02)',
    };
  }

  return {
    kind: 'rows',
    fates: RESPONSES.map((row): RowFate => {
      if (!filtered(row)) {
        return { kept: false, reason: 'the where clause' };
      }
      if (org === null) {
        return {
          kept: false,
          reason: 'policy: app.current_org is NULL, so never equal',
        };
      }
      if (row.organisationId !== org) {
        return { kept: false, reason: 'policy: another organisation' };
      }
      if (caller.role === 'manager') {
        return { kept: true, reason: 'policy: same organisation, a Manager' };
      }
      if (row.userId === user) {
        return { kept: true, reason: 'policy: same organisation, own row' };
      }
      return { kept: false, reason: 'policy: a Member, and not their own row' };
    }),
  };
}
