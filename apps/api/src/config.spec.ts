import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assertDatabaseInvariants,
  loadConfig,
  type InvariantQuery,
  type InvariantRow,
} from './config.js';
import { loadRootEnv, requireEnv } from './db/load-env.js';

const OWNER_URL = 'postgres://owner:owner@127.0.0.1:5432/pulse';
const APP_URL = 'postgres://app:app@127.0.0.1:5432/pulse';

function env(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    DATABASE_URL_OWNER: OWNER_URL,
    DATABASE_URL_APP: APP_URL,
    ...overrides,
  };
}

const CLEAN_ROW: InvariantRow = {
  rolsuper: false,
  rolbypassrls: false,
  owned_tables: 0,
  privileged_roles: '',
  dev_schema: false,
  dev_list_users: false,
  dev_create_session: false,
};

const ALL_DEV_GRANTS = {
  dev_schema: true,
  dev_list_users: true,
  dev_create_session: true,
};

function stubQuery(overrides: Partial<InvariantRow> = {}): InvariantQuery {
  return {
    query: () => Promise.resolve({ rows: [{ ...CLEAN_ROW, ...overrides }] }),
  };
}

const OFF = { devSignIn: false };
const DEV = { devSignIn: true };

describe('loadConfig', () => {
  it('applies the defaults when only the two URLs are given', () => {
    const config = loadConfig(env());
    expect(config.authMode).toBe('off');
    expect(config.devSignIn).toBe(false);
    expect(config.sessionTtlHours).toBe(12);
    expect(config.apiPort).toBe(3000);
    // No NODE_ENV counts as production, so the cookie is secure by default.
    expect(config.isDevelopment).toBe(false);
  });

  it('derives devSignIn from AUTH_MODE', () => {
    expect(
      loadConfig(env({ AUTH_MODE: 'dev', NODE_ENV: 'development' })).devSignIn,
    ).toBe(true);
    expect(loadConfig(env({ AUTH_MODE: 'off' })).devSignIn).toBe(false);
  });

  it('throws when a URL is missing', () => {
    expect(() => loadConfig(env({ DATABASE_URL_APP: undefined }))).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('throws when the two URLs are equal', () => {
    expect(() => loadConfig(env({ DATABASE_URL_APP: OWNER_URL }))).toThrow(
      /must differ/,
    );
  });

  it('throws on an unknown AUTH_MODE', () => {
    expect(() => loadConfig(env({ AUTH_MODE: 'bogus' }))).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('refuses AUTH_MODE=dev with NODE_ENV=production', () => {
    expect(() =>
      loadConfig(env({ AUTH_MODE: 'dev', NODE_ENV: 'production' })),
    ).toThrow(/NODE_ENV=development/);
  });

  it('refuses AUTH_MODE=dev when NODE_ENV is unset, empty or unknown', () => {
    for (const nodeEnv of [undefined, '', 'staging', 'prod']) {
      expect(() =>
        loadConfig(env({ AUTH_MODE: 'dev', NODE_ENV: nodeEnv })),
      ).toThrow(/NODE_ENV=development/);
    }
  });

  it('allows AUTH_MODE=dev with NODE_ENV development or test, in any case', () => {
    for (const nodeEnv of ['development', 'test', 'Development']) {
      const config = loadConfig(env({ AUTH_MODE: 'dev', NODE_ENV: nodeEnv }));
      expect(config.devSignIn).toBe(true);
      expect(config.isDevelopment).toBe(true);
    }
  });

  it('treats production and an unset NODE_ENV the same way', () => {
    for (const nodeEnv of ['production', undefined]) {
      const config = loadConfig(env({ AUTH_MODE: 'off', NODE_ENV: nodeEnv }));
      expect(config.isDevelopment).toBe(false);
      expect(config.devSignIn).toBe(false);
    }
  });
});

describe('assertDatabaseInvariants (stub)', () => {
  it('rejects a superuser', async () => {
    await expect(
      assertDatabaseInvariants(stubQuery({ rolsuper: true }), OFF),
    ).rejects.toThrow(/superuser/);
  });

  it('rejects a role with BYPASSRLS', async () => {
    await expect(
      assertDatabaseInvariants(stubQuery({ rolbypassrls: true }), OFF),
    ).rejects.toThrow(/BYPASSRLS/);
  });

  it('rejects a role that owns a table', async () => {
    await expect(
      assertDatabaseInvariants(stubQuery({ owned_tables: 1 }), OFF),
    ).rejects.toThrow(/owns 1 table/);
  });

  it('rejects a role that can SET ROLE to a privileged role', async () => {
    await expect(
      assertDatabaseInvariants(
        stubQuery({ privileged_roles: 'pulse_owner' }),
        OFF,
      ),
    ).rejects.toThrow(/member of pulse_owner/);
  });

  it('rejects any dev grant when AUTH_MODE is off', async () => {
    for (const grant of [
      'dev_schema',
      'dev_list_users',
      'dev_create_session',
    ] as const) {
      await expect(
        assertDatabaseInvariants(stubQuery({ [grant]: true }), OFF),
      ).rejects.toThrow(/AUTH_MODE is off/);
    }
  });

  it('rejects AUTH_MODE=dev unless every dev grant is present', async () => {
    await expect(assertDatabaseInvariants(stubQuery(), DEV)).rejects.toThrow(
      /db:seed/,
    );
    await expect(
      assertDatabaseInvariants(
        stubQuery({ ...ALL_DEV_GRANTS, dev_create_session: false }),
        DEV,
      ),
    ).rejects.toThrow(/db:seed/);
  });

  it('resolves for a clean app role in either mode', async () => {
    await expect(
      assertDatabaseInvariants(stubQuery(), OFF),
    ).resolves.toBeUndefined();
    await expect(
      assertDatabaseInvariants(stubQuery(ALL_DEV_GRANTS), DEV),
    ).resolves.toBeUndefined();
  });
});

describe('assertDatabaseInvariants (real pools)', () => {
  loadRootEnv();
  const appPool = new Pool({
    connectionString: requireEnv('TEST_DATABASE_URL_APP'),
  });
  const ownerPool = new Pool({
    connectionString: requireEnv('TEST_DATABASE_URL_OWNER'),
  });

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
  });

  it('resolves for the app role with dev sign-in, since the test setup granted it', async () => {
    await expect(
      assertDatabaseInvariants(appPool, DEV),
    ).resolves.toBeUndefined();
  });

  it('rejects the same app role with AUTH_MODE off, because the dev grants are live', async () => {
    await expect(assertDatabaseInvariants(appPool, OFF)).rejects.toThrow(
      /AUTH_MODE is off/,
    );
  });

  it('rejects the owner role, which owns tables in public', async () => {
    await expect(assertDatabaseInvariants(ownerPool, OFF)).rejects.toThrow(
      /owns/,
    );
  });

  it('rejects a role that is only a member of pulse_owner', async () => {
    // A throwaway login role, so pulse_app itself is never granted pulse_owner while other
    // test files run against it. Needs the Compose superuser to create and drop the role.
    const port = process.env.POSTGRES_PORT ?? '5432';
    const superUrl = `postgres://${requireEnv('POSTGRES_USER')}:${requireEnv('POSTGRES_PASSWORD')}@127.0.0.1:${port}/pulse_test`;
    const role = `pulse_probe_${randomBytes(4).toString('hex')}`;
    const password = randomBytes(12).toString('hex');
    const admin = new Client({ connectionString: superUrl });
    await admin.connect();
    try {
      await admin.query(
        `create role ${role} login password '${password}' nosuperuser nobypassrls`,
      );
      await admin.query(`grant pulse_owner to ${role}`);
      const probePool = new Pool({
        connectionString: `postgres://${role}:${password}@127.0.0.1:${port}/pulse_test`,
      });
      try {
        await expect(assertDatabaseInvariants(probePool, OFF)).rejects.toThrow(
          /member of pulse_owner/,
        );
      } finally {
        await probePool.end();
      }
    } finally {
      await admin.query(`drop role if exists ${role}`);
      await admin.end();
    }
  });
});
