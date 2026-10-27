import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtures } from '../src/db/fixtures.js';
import type { SessionState } from '@pulse/contracts';
import {
  cookieValue,
  createTestApp,
  setCookieHeader,
} from './helpers/test-app.js';

const acme = fixtures.acme;
const blueRiver = fixtures.blueRiver;
const UNKNOWN_USER_ID = '00000000-0000-4000-8000-000000000000';

/**
 * The dev sign-in picker is the one deliberate cross-tenant path, so it must be unreachable
 * unless `AUTH_MODE=dev`: a 404 (not a 400 or 401) with it off, and with it on, a picker
 * that lists only active users and issues a working httpOnly session cookie.
 */
describe('dev gate with AUTH_MODE=off', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ AUTH_MODE: 'off' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 404 on both dev routes', async () => {
    await request(app.getHttpServer()).get('/api/dev/users').expect(404);
    await request(app.getHttpServer())
      .post('/api/dev/sessions')
      .send({ userId: acme.users.memberLongAgo.id })
      .expect(404);
  });

  it('answers 404 before validation, so an invalid body is not a 400', async () => {
    await request(app.getHttpServer())
      .post('/api/dev/sessions')
      .send({ userId: 'nope' })
      .expect(404);
  });

  it('reports devSignIn: false on GET /api/me', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/me')
      .expect(200);
    expect(response.body).toMatchObject({ signedIn: false, devSignIn: false });
  });
});

describe('dev gate with AUTH_MODE=dev', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ AUTH_MODE: 'dev', SESSION_TTL_HOURS: '12' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists active users from both organisations and hides deactivated users', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dev/users')
      .expect(200);
    const users = response.body.users as Array<{
      id: string;
      name: string;
      role: string;
      organisation: { id: string; name: string };
    }>;

    const organisationNames = new Set(
      users.map((user) => user.organisation.name),
    );
    expect(organisationNames.has(acme.organisation.name)).toBe(true);
    expect(organisationNames.has(blueRiver.organisation.name)).toBe(true);

    for (const user of users) {
      expect(typeof user.id).toBe('string');
      expect(typeof user.name).toBe('string');
      expect(['manager', 'member']).toContain(user.role);
      expect(typeof user.organisation.id).toBe('string');
      expect(typeof user.organisation.name).toBe('string');
    }

    const ids = users.map((user) => user.id);
    expect(ids).not.toContain(acme.users.memberDeactivatedBeforeWeek.id);
    expect(ids).not.toContain(blueRiver.users.memberDeactivatedMidWeek.id);
  });

  it('creates a Member session, sets the cookie attributes, and the cookie works', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/dev/sessions')
      .send({ userId: acme.users.memberLongAgo.id })
      .expect(201);

    expect(response.body).toEqual({
      signedIn: true,
      user: {
        id: acme.users.memberLongAgo.id,
        name: acme.users.memberLongAgo.name,
      },
      organisation: { id: acme.organisation.id, name: acme.organisation.name },
      role: 'member',
      devSignIn: true,
    } satisfies SessionState);

    const raw = setCookieHeader(response.headers['set-cookie']);
    expect(raw).toContain('pulse_session=');
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Lax');
    expect(raw).toContain('Path=/');
    expect(raw).toContain('Max-Age=43200');
    expect(raw).not.toContain('Secure');

    const cookie = `pulse_session=${cookieValue(response.headers['set-cookie'])}`;
    const me = await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body).toMatchObject({ signedIn: true, role: 'member' });
  });

  it('answers 404 for an unknown user id and a deactivated user, never 400', async () => {
    await request(app.getHttpServer())
      .post('/api/dev/sessions')
      .send({ userId: UNKNOWN_USER_ID })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/dev/sessions')
      .send({ userId: acme.users.memberDeactivatedBeforeWeek.id })
      .expect(404);
  });

  it('answers 400 with a path-prefixed message array for a malformed userId', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/dev/sessions')
      .send({ userId: 'not-a-uuid' })
      .expect(400);
    expect(response.body.statusCode).toBe(400);
    expect(Array.isArray(response.body.message)).toBe(true);
    expect(response.body.message[0]).toMatch(/^userId: /);
    expect(response.body.path).toBe('/api/dev/sessions');
  });
});
