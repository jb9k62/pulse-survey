import { Controller, Get, type INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CurrentTx, Roles } from '../src/auth/decorators.js';
import { assertDatabaseInvariants } from '../src/config.js';
import type { TenantTx } from '../src/db/db.module.js';
import { fixtures } from '../src/db/fixtures.js';
import { loadRootEnv, requireEnv } from '../src/db/load-env.js';
import {
  countSessionsWithHash,
  createTestApp,
  insertSession,
  ownerClient,
  randomToken,
  sha256Hex,
  signIn,
  type SignInResult,
} from './helpers/test-app.js';

const acme = fixtures.acme;

type ContextRow = {
  org: string | null;
  user_id: string | null;
  role: string | null;
  token: string | null;
};

// Proven before the surveys slice exists, so the 403s and the tenant context have a route.
@Controller('probe')
class ProbeController {
  @Get('manager')
  @Roles(['manager'])
  manager(): { ok: boolean } {
    return { ok: true };
  }

  @Get('member')
  @Roles(['member'])
  member(): { ok: boolean } {
    return { ok: true };
  }

  @Get('context')
  async context(@CurrentTx() tx: TenantTx): Promise<ContextRow> {
    const result = await tx.execute<ContextRow>(
      sql`select
        current_setting('app.current_org', true) as org,
        current_setting('app.current_user', true) as user_id,
        current_setting('app.current_role', true) as role,
        current_setting('app.current_session_token', true) as token`,
    );
    return result.rows[0]!;
  }
}

/**
 * The session and tenant plumbing through the real pipeline: cookie resolution, expiry and
 * deactivation, logout, role checks, and the `app.current_*` settings the interceptor puts
 * on the request transaction (the `context` probe reads them back). See the RLS overview at
 * the top of src/db/schema.ts for how those settings drive the policies.
 */
describe('tenant plumbing (e2e)', () => {
  let app: INestApplication;
  let owner: Awaited<ReturnType<typeof ownerClient>>;

  beforeAll(async () => {
    app = await createTestApp({ AUTH_MODE: 'dev', SESSION_TTL_HOURS: '12' }, [
      ProbeController,
    ]);
    owner = await ownerClient();
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('GET /api/health is 200 with no cookie', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /api/me with no cookie returns the signed-out state', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/me')
      .expect(200);
    expect(response.body).toEqual({
      signedIn: false,
      user: null,
      organisation: null,
      role: null,
      devSignIn: true,
    });
  });

  it('GET /api/me with a seeded Acme Manager session returns the principal', async () => {
    const session = await signIn(app, acme.users.managerOne.id);
    const response = await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', session.cookie)
      .expect(200);
    expect(response.body).toEqual({
      signedIn: true,
      user: { id: acme.users.managerOne.id, name: acme.users.managerOne.name },
      organisation: { id: acme.organisation.id, name: acme.organisation.name },
      role: 'manager',
      devSignIn: true,
    });
  });

  it('DELETE /api/sessions with no cookie is 401 with the contract body', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/sessions')
      .expect(401);
    expect(response.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      path: '/api/sessions',
    });
    expect(Array.isArray(response.body.message)).toBe(true);
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('rejects a random token and a flipped-character token', async () => {
    await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Cookie', `pulse_session=${randomToken()}`)
      .expect(401);

    const session = await signIn(app, acme.users.managerOne.id);
    const flipped =
      (session.token[0] === 'a' ? 'b' : 'a') + session.token.slice(1);
    await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Cookie', `pulse_session=${flipped}`)
      .expect(401);
  });

  it('rejects an expired session and deletes the row', async () => {
    const token = randomToken();
    const tokenHash = sha256Hex(token);
    await insertSession(owner, {
      userId: acme.users.managerOne.id,
      tokenHash,
      createdAt: new Date(Date.now() - 2 * 86_400_000),
      expiresAt: new Date(Date.now() - 86_400_000),
    });

    await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Cookie', `pulse_session=${token}`)
      .expect(401);

    expect(await countSessionsWithHash(owner, tokenHash)).toBe(0);
  });

  it('rejects a deactivated user session and deletes the row', async () => {
    const token = randomToken();
    const tokenHash = sha256Hex(token);
    await insertSession(owner, {
      userId: acme.users.memberDeactivatedBeforeWeek.id,
      tokenHash,
      createdAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Cookie', `pulse_session=${token}`)
      .expect(401);

    expect(await countSessionsWithHash(owner, tokenHash)).toBe(0);
  });

  it('logout is 204, clears the cookie, deletes the row, and the next call is 401', async () => {
    const session = await signIn(app, acme.users.memberLongAgo.id);
    const tokenHash = sha256Hex(session.token);

    const response = await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Cookie', session.cookie)
      .expect(204);

    const setCookie = response.headers['set-cookie'];
    const header = Array.isArray(setCookie)
      ? setCookie.join(';')
      : String(setCookie);
    expect(header).toContain('pulse_session=;');
    expect(header).toContain('Expires=Thu, 01 Jan 1970');

    expect(await countSessionsWithHash(owner, tokenHash)).toBe(0);

    await request(app.getHttpServer())
      .delete('/api/sessions')
      .set('Cookie', session.cookie)
      .expect(401);
  });

  it('enforces roles: 403 for a mismatch, 200 for a match', async () => {
    const manager: SignInResult = await signIn(app, acme.users.managerOne.id);
    const member: SignInResult = await signIn(app, acme.users.memberLongAgo.id);

    await request(app.getHttpServer())
      .get('/api/probe/manager')
      .set('Cookie', member.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/probe/member')
      .set('Cookie', manager.cookie)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/probe/manager')
      .set('Cookie', manager.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/probe/member')
      .set('Cookie', member.cookie)
      .expect(200);
  });

  it('sets all four app.current_* settings on the request transaction', async () => {
    const session = await signIn(app, acme.users.managerOne.id);
    const response = await request(app.getHttpServer())
      .get('/api/probe/context')
      .set('Cookie', session.cookie)
      .expect(200);
    expect(response.body).toEqual({
      org: acme.organisation.id,
      user_id: acme.users.managerOne.id,
      role: 'manager',
      token: sha256Hex(session.token),
    });
  });

  it('startup invariants resolve for the app role in dev mode and reject the owner', async () => {
    loadRootEnv();
    const appPool = new Pool({
      connectionString: requireEnv('TEST_DATABASE_URL_APP'),
    });
    const ownerPool = new Pool({
      connectionString: requireEnv('TEST_DATABASE_URL_OWNER'),
    });
    try {
      await expect(
        assertDatabaseInvariants(appPool, { devSignIn: true }),
      ).resolves.toBeUndefined();
      await expect(
        assertDatabaseInvariants(ownerPool, { devSignIn: true }),
      ).rejects.toThrow(/owns/);
    } finally {
      await appPool.end();
      await ownerPool.end();
    }
  });
});
