import { type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule, configureApp } from '../../src/app.module.js';
import type { SessionState } from '@pulse/contracts';
import { SESSION_COOKIE } from '../../src/auth/sessions.service.js';
import { loadRootEnv, requireEnv } from '../../src/db/load-env.js';

/**
 * Build the real `AppModule` with the real pipeline. `process.env` must be set before
 * `compile()`, because the `APP_CONFIG` factory runs at compile time. Vitest isolates spec
 * files in separate processes, so each spec sets its own `AUTH_MODE`.
 */
export async function createTestApp(
  env: Record<string, string> = {},
  controllers: Type<unknown>[] = [],
): Promise<INestApplication> {
  loadRootEnv();
  // The e2e suite runs against `pulse_test`, which the global setup migrates and seeds.
  // Point the app at it unless a spec overrides the URL explicitly.
  const testAppUrl = process.env.TEST_DATABASE_URL_APP;
  if (testAppUrl !== undefined && env.DATABASE_URL_APP === undefined) {
    process.env.DATABASE_URL_APP = testAppUrl;
  }
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export function sha256Hex(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Read the `pulse_session` value out of a `Set-Cookie` header. */
export function cookieValue(
  setCookieHeader: string | string[] | undefined,
  name: string = SESSION_COOKIE,
): string {
  const headers = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  for (const header of headers) {
    if (typeof header !== 'string') {
      continue;
    }
    const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(header);
    if (match) {
      return match[1] ?? '';
    }
  }
  throw new Error(`No ${name} cookie in the set-cookie header`);
}

export function setCookieHeader(
  setCookieHeaderValue: string | string[] | undefined,
  name: string = SESSION_COOKIE,
): string {
  const headers = Array.isArray(setCookieHeaderValue)
    ? setCookieHeaderValue
    : [setCookieHeaderValue];
  const match = headers.find(
    (header): header is string =>
      typeof header === 'string' && header.startsWith(`${name}=`),
  );
  if (!match) {
    throw new Error(`No ${name} cookie in the set-cookie header`);
  }
  return match;
}

export interface SignInResult {
  cookie: string;
  token: string;
  body: SessionState;
}

/** Sign in through the dev route and return the cookie header plus the response body. */
export async function signIn(
  app: INestApplication,
  userId: string,
): Promise<SignInResult> {
  const response = await request(app.getHttpServer())
    .post('/api/dev/sessions')
    .send({ userId })
    .expect(201);
  const token = cookieValue(response.headers['set-cookie']);
  return {
    cookie: `${SESSION_COOKIE}=${token}`,
    token,
    body: response.body as SessionState,
  };
}

/**
 * A connection as the owner, which owns the tables and so bypasses RLS. Tests use it to set
 * up rows pulse_app cannot write (it has no INSERT on `sessions`) and to check the real
 * state of a table behind the policies.
 */
export async function ownerClient(): Promise<Client> {
  loadRootEnv();
  const client = new Client({
    connectionString: requireEnv('TEST_DATABASE_URL_OWNER'),
  });
  await client.connect();
  return client;
}

export interface InsertSessionInput {
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Insert a session row as the owner. An expired row must set `created_at` in the past:
 * `sessions_expires_at_check` requires `expires_at > created_at`.
 */
export async function insertSession(
  client: Client,
  input: InsertSessionInput,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into sessions (user_id, token_hash, created_at, expires_at)
     values ($1::uuid, $2, $3, $4)
     returning id`,
    [input.userId, input.tokenHash, input.createdAt, input.expiresAt],
  );
  return result.rows[0]!.id;
}

export async function countSessionsWithHash(
  client: Client,
  tokenHash: string,
): Promise<number> {
  // `::int` makes pg return a number; a bare count(*) is a bigint and comes back as a string.
  const result = await client.query<{ count: number }>(
    'select count(*)::int as count from sessions where token_hash = $1',
    [tokenHash],
  );
  return result.rows[0]!.count;
}
