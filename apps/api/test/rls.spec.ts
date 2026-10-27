/**
 * The RLS policies tested directly in SQL, below the API. See the RLS overview at the top
 * of src/db/schema.ts for the model being tested.
 *
 * The client connects as pulse_app (TEST_DATABASE_URL_APP), the role the API uses. That is
 * the point of the suite: the owner is exempt from its own tables' policies, so the same
 * tests run as the owner would pass whatever the policies said. The first case checks the
 * role so a misconfigured URL fails loudly instead of passing quietly.
 *
 * Each case plays the interceptor's part by hand: it opens a transaction, sets the
 * `app.current_*` settings, queries, and rolls back.
 */

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { fixtures } from '../src/db/fixtures.js';
import { loadRootEnv, requireEnv } from '../src/db/load-env.js';

const acme = fixtures.acme;
const blueRiver = fixtures.blueRiver;

const TABLES = [
  'organisations',
  'users',
  'sessions',
  'surveys',
  'questions',
  'responses',
  'answers',
] as const;

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

// Once a transaction-local `set_config("name", value, true)` has run, the setting reads
// as an empty string, not NULL, on that connection after the transaction ends (commit or
// rollback). So every case sets all four names explicitly and cannot inherit what an
// earlier case left, and the fail-closed case below runs before any case has set one.
// An unset org or user becomes this all-zero uuid, which matches no row.
const NO_ORG = '00000000-0000-0000-0000-000000000000';

type SettingKey =
  | 'app.current_org'
  | 'app.current_user'
  | 'app.current_role'
  | 'app.current_session_token';

interface Settings {
  org?: string;
  user?: string;
  role?: string;
  token?: string;
}

let client: Client;
let currentWeek: string;

beforeAll(async () => {
  loadRootEnv();
  client = new Client({
    connectionString: requireEnv('TEST_DATABASE_URL_APP'),
  });
  await client.connect();
  const result = await client.query<{ week_start: string }>(
    `select date_trunc('week', now() at time zone 'utc')::date::text as week_start`,
  );
  currentWeek = result.rows[0]!.week_start;
});

afterAll(async () => {
  await client.end();
});

async function applySetting(name: SettingKey, value: string): Promise<void> {
  await client.query('select set_config($1, $2, true)', [name, value]);
}

async function applySettings(settings: Settings): Promise<void> {
  await applySetting('app.current_org', settings.org ?? NO_ORG);
  await applySetting('app.current_user', settings.user ?? NO_ORG);
  await applySetting('app.current_role', settings.role ?? '');
  await applySetting('app.current_session_token', settings.token ?? '');
}

/**
 * Every case runs in its own transaction. `set_config(..., true)` is transaction
 * local, so the settings cannot leak between cases, and the ROLLBACK undoes the
 * writes a case makes.
 */
async function withSettings<T>(
  settings: Settings,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    await applySettings(settings);
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function count(
  table: string,
  where = '',
  params: unknown[] = [],
): Promise<number> {
  const result = await client.query<{ n: number }>(
    `select count(*)::int as n from ${table}${where}`,
    params,
  );
  return result.rows[0]!.n;
}

function asMember(userId: string): Settings {
  return { org: acme.organisation.id, user: userId, role: 'member' };
}

const acmeManager: Settings = {
  org: acme.organisation.id,
  user: acme.users.managerOne.id,
  role: 'manager',
};

const blueRiverManager: Settings = {
  org: blueRiver.organisation.id,
  user: blueRiver.users.managerOne.id,
  role: 'manager',
};

async function createSession(userId: string, tokenHash: string): Promise<void> {
  await client.query(
    "select dev.create_session($1, $2, now() + interval '1 hour')",
    [userId, tokenHash],
  );
}

async function deleteSessions(tokenHash: string): Promise<number> {
  return withSettings({ token: tokenHash }, async () => {
    const result = await client.query('delete from sessions');
    return result.rowCount ?? 0;
  });
}

describe('row-level security as pulse_app', () => {
  it('connects as a non-superuser without BYPASSRLS', async () => {
    const result = await client.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      'select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user',
    );
    expect(result.rows[0]).toEqual({
      current_user: 'pulse_app',
      rolsuper: false,
      rolbypassrls: false,
    });
  });

  it('fails closed: with no settings every table returns no rows', async () => {
    // Runs first, on a connection that has never set a tenant setting, so this is
    // the true NULL-is-no-match case.
    await client.query('BEGIN');
    try {
      for (const table of TABLES) {
        expect(await count(table), table).toBe(0);
      }
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('lets an Acme Manager see the whole Acme organisation', async () => {
    await withSettings(acmeManager, async () => {
      expect(await count('organisations')).toBe(1);
      expect(await count('users')).toBe(7);
      expect(await count('surveys')).toBe(1);
      expect(await count('questions')).toBe(3);
      expect(await count('responses')).toBe(2);
      expect(await count('answers')).toBe(6);
    });
  });

  it('lets an Acme Member see only their own responses and answers', async () => {
    await withSettings(asMember(acme.users.memberLongAgo.id), async () => {
      expect(await count('responses')).toBe(1);
      expect(await count('answers')).toBe(3);
    });

    await withSettings(
      asMember(acme.users.memberDeactivatedBeforeWeek.id),
      async () => {
        expect(await count('responses')).toBe(0);
        expect(await count('answers')).toBe(0);
      },
    );
  });

  it('lets a Member read only their own user row, not the rest of the organisation', async () => {
    await withSettings(asMember(acme.users.memberLongAgo.id), async () => {
      expect(await count('users')).toBe(1);
      expect(
        await count('users', ' where id = $1', [acme.users.memberLongAgo.id]),
      ).toBe(1);
      expect(
        await count('users', ' where id = $1', [acme.users.managerOne.id]),
      ).toBe(0);
    });
  });

  it('lets Blue River see its own rows, archived survey included', async () => {
    await withSettings(blueRiverManager, async () => {
      expect(await count('organisations')).toBe(1);
      expect(await count('surveys')).toBe(2);
      expect(await count('questions')).toBe(6);
      expect(await count('responses')).toBe(1);
    });
  });

  it('cannot read another organisation even when its id is known', async () => {
    await withSettings(acmeManager, async () => {
      expect(
        await count('surveys', ' where organisation_id = $1', [
          blueRiver.organisation.id,
        ]),
      ).toBe(0);
      expect(
        await count('users', ' where organisation_id = $1', [
          blueRiver.organisation.id,
        ]),
      ).toBe(0);
    });
  });

  it('rejects a Member inserting a response for another user', async () => {
    await withSettings(
      asMember(acme.users.memberDeactivatedMidWeek.id),
      async () => {
        await expect(
          client.query(
            'insert into responses (organisation_id, survey_id, user_id, week_start) values ($1, $2, $3, $4)',
            [
              acme.organisation.id,
              acme.surveys.active.id,
              acme.users.memberMidWeek.id,
              currentWeek,
            ],
          ),
        ).rejects.toMatchObject({ code: '42501' });
      },
    );
  });

  it('rejects a Manager inserting a response for a Member of their own organisation', async () => {
    await withSettings(acmeManager, async () => {
      await expect(
        client.query(
          'insert into responses (organisation_id, survey_id, user_id, week_start) values ($1, $2, $3, $4)',
          [
            acme.organisation.id,
            acme.surveys.active.id,
            acme.users.memberDeactivatedMidWeek.id,
            currentWeek,
          ],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('accepts a Member inserting their own response, then the transaction rolls back', async () => {
    await withSettings(
      asMember(acme.users.memberDeactivatedMidWeek.id),
      async () => {
        const inserted = await client.query(
          'insert into responses (organisation_id, survey_id, user_id, week_start) values ($1, $2, $3, $4)',
          [
            acme.organisation.id,
            acme.surveys.active.id,
            acme.users.memberDeactivatedMidWeek.id,
            currentWeek,
          ],
        );
        expect(inserted.rowCount).toBe(1);
        expect(await count('responses')).toBe(1);
      },
    );

    await withSettings(
      asMember(acme.users.memberDeactivatedMidWeek.id),
      async () => {
        expect(await count('responses')).toBe(0);
      },
    );
  });

  it("rejects a Member inserting into another organisation's survey", async () => {
    await withSettings(
      asMember(acme.users.memberDeactivatedMidWeek.id),
      async () => {
        await expect(
          client.query(
            'insert into responses (organisation_id, survey_id, user_id, week_start) values ($1, $2, $3, $4)',
            [
              blueRiver.organisation.id,
              blueRiver.surveys.active.id,
              blueRiver.users.memberMidWeek.id,
              currentWeek,
            ],
          ),
        ).rejects.toMatchObject({ code: '42501' });
      },
    );
  });

  it('rejects a Member creating a survey or a question in their own organisation', async () => {
    await withSettings(asMember(acme.users.memberLongAgo.id), async () => {
      await expect(
        client.query(
          "insert into surveys (organisation_id, title, status) values ($1, 'Member survey', 'archived')",
          [acme.organisation.id],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
    await withSettings(asMember(acme.users.memberLongAgo.id), async () => {
      await expect(
        client.query(
          "insert into questions (organisation_id, survey_id, position, type, prompt) values ($1, $2, 1, 'rating', 'Extra')",
          [acme.organisation.id, acme.surveys.active.id],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('lets a Member read the survey but not change it', async () => {
    await withSettings(asMember(acme.users.memberLongAgo.id), async () => {
      expect(
        await count('surveys', ' where id = $1', [acme.surveys.active.id]),
      ).toBe(1);
      const updated = await client.query(
        "update surveys set status = 'archived' where id = $1",
        [acme.surveys.active.id],
      );
      expect(updated.rowCount).toBe(0);
    });
  });

  it('lets a Manager create a survey, then the transaction rolls back', async () => {
    await withSettings(acmeManager, async () => {
      const inserted = await client.query(
        "insert into surveys (organisation_id, title, status) values ($1, 'Manager survey', 'archived')",
        [acme.organisation.id],
      );
      expect(inserted.rowCount).toBe(1);
    });
  });

  it('shows a session row only for the matching token hash', async () => {
    await createSession(acme.users.memberLongAgo.id, HASH_A);
    try {
      await withSettings({ token: HASH_A }, async () => {
        expect(await count('sessions')).toBe(1);
      });
      await withSettings({ token: HASH_B }, async () => {
        expect(await count('sessions')).toBe(0);
      });
      await withSettings({}, async () => {
        expect(await count('sessions')).toBe(0);
      });
      expect(await count('sessions')).toBe(0);
    } finally {
      await deleteSessions(HASH_A);
    }
  });

  it('resolves a session in two steps: token first, then user', async () => {
    const tokenHash = 'c'.repeat(64);
    await createSession(acme.users.memberLongAgo.id, tokenHash);
    try {
      await withSettings({ token: tokenHash }, async () => {
        expect(await count('sessions')).toBe(1);
        expect(await count('users')).toBe(0);

        await applySetting('app.current_user', acme.users.memberLongAgo.id);
        expect(await count('users')).toBe(1);
      });
    } finally {
      await deleteSessions(tokenHash);
    }
  });

  it('deletes a session row only for the matching token hash', async () => {
    const tokenHash = 'd'.repeat(64);
    await createSession(acme.users.memberLongAgo.id, tokenHash);
    try {
      // A non-matching token must not delete the row, even though the SELECT
      // policy still cannot see it either way.
      expect(await deleteSessions(HASH_B)).toBe(0);
      await withSettings({ token: tokenHash }, async () => {
        expect(await count('sessions')).toBe(1);
      });
      // The matching token deletes exactly the one row.
      expect(await deleteSessions(tokenHash)).toBe(1);
    } finally {
      await deleteSessions(tokenHash);
    }
  });

  it('refuses an unknown or deactivated user with SQLSTATE P0002', async () => {
    await expect(
      client.query(
        "select dev.create_session($1, $2, now() + interval '1 hour')",
        ['99999999-9999-4999-8999-999999999999', HASH_A],
      ),
    ).rejects.toMatchObject({ code: 'P0002' });

    await expect(
      client.query(
        "select dev.create_session($1, $2, now() + interval '1 hour')",
        [acme.users.memberDeactivatedBeforeWeek.id, HASH_A],
      ),
    ).rejects.toMatchObject({ code: 'P0002' });
  });
});

describe('dev sign-in grants', () => {
  it('are not created by the migrations, which also run in production', () => {
    // Recorded by the global setup after migrate() and before grantDevSignIn().
    expect(inject('devGrantsAfterMigrate')).toBe(false);
  });
});
