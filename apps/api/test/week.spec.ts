import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRootEnv, requireEnv } from '../src/db/load-env.js';
import { isWeekStart } from '@pulse/contracts';
import { weekLabel, weekOf, weekStartOf } from '../src/surveys/week.js';

describe('isWeekStart', () => {
  it.each(['2026-09-21', '2026-09-28'])('accepts the Monday %s', (value) => {
    expect(isWeekStart(value)).toBe(true);
  });

  it.each([
    '2026-09-27',
    '2026-09-20',
    '2026-9-21',
    '2026-02-30',
    'not-a-date',
    '',
  ])('rejects %j', (value) => {
    expect(isWeekStart(value)).toBe(false);
  });
});

describe('weekLabel and weekOf', () => {
  it('labels a week inside one month', () => {
    expect(weekLabel('2026-09-21')).toBe('Mon 21 Sep to Sun 27 Sep');
    expect(weekOf('2026-09-21')).toEqual({
      start: '2026-09-21',
      end: '2026-09-27',
      label: 'Mon 21 Sep to Sun 27 Sep',
    });
  });

  it('labels a week that crosses a month', () => {
    expect(weekLabel('2026-09-28')).toBe('Mon 28 Sep to Sun 4 Oct');
  });

  it('labels a week that crosses the year', () => {
    expect(weekLabel('2026-12-28')).toBe('Mon 28 Dec to Sun 3 Jan');
  });
});

describe('weekStartOf against the test database', () => {
  let client: Client;
  let db: NodePgDatabase;

  beforeAll(async () => {
    loadRootEnv();
    client = new Client({
      connectionString: requireEnv('TEST_DATABASE_URL_OWNER'),
    });
    await client.connect();
    db = drizzle(client);
  });

  afterAll(async () => {
    await client.end();
  });

  // The `::text` cast keeps this a plain string: raw pg parses a date into a
  // local-midnight Date, which is a day early in SAST, so the test never relies
  // on that parser.
  async function startFor(instant: string): Promise<string> {
    const result = await db.execute<{ week_start: string }>(
      sql`select (${weekStartOf(sql`${instant}::timestamptz`)})::text as week_start`,
    );
    return result.rows[0]!.week_start;
  }

  it.each([
    ['2026-09-21T00:00:00.000Z', '2026-09-21'],
    ['2026-09-27T23:59:59.999Z', '2026-09-21'],
    ['2026-09-28T00:00:00.001Z', '2026-09-28'],
  ])('maps %s to %s', async (instant, expected) => {
    expect(await startFor(instant)).toBe(expected);
  });

  it('holds a month boundary in the week that started before it', async () => {
    expect(await startFor('2026-09-30T23:59:59.999Z')).toBe('2026-09-28');
    expect(await startFor('2026-10-01T00:00:00.000Z')).toBe('2026-09-28');
  });

  it('holds a year boundary in the week that started before it', async () => {
    expect(await startFor('2026-12-31T23:59:59.999Z')).toBe('2026-12-28');
    expect(await startFor('2027-01-01T00:00:00.000Z')).toBe('2026-12-28');
  });

  it('computes in UTC, not in local time', async () => {
    // Monday 00:30 in SAST (UTC+2) is still Sunday 22:30 UTC, so it belongs to the
    // previous week.
    expect(await startFor('2026-09-20T22:30:00.000Z')).toBe('2026-09-14');
  });
});
