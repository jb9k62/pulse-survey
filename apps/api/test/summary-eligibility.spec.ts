import { eq, inArray, TransactionRollbackError } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantTx } from '../src/db/db.module.js';
import { fixtures } from '../src/db/fixtures.js';
import { loadRootEnv, requireEnv } from '../src/db/load-env.js';
import * as schema from '../src/db/schema.js';
import { SummaryService } from '../src/surveys/summary.service.js';
import { SurveysRepository } from '../src/surveys/surveys.repository.js';
import type { Summary } from '@pulse/contracts';

const acme = fixtures.acme;

loadRootEnv();
// The owner, because pulse_app has no UPDATE on users. The summary SQL filters by
// organisation itself, so bypassing RLS here does not change what it counts.
const pool = new Pool({
  connectionString: requireEnv('TEST_DATABASE_URL_OWNER'),
});
const db = drizzle(pool, { schema });
const service = new SummaryService(new SurveysRepository());

afterAll(async () => {
  await pool.end();
});

/**
 * Run `prepare`, read the Acme summary in the same transaction, then roll back, so the
 * change is never visible to the other test files sharing pulse_test.
 */
async function summaryAfter(
  prepare: (tx: TenantTx) => Promise<void>,
): Promise<Summary> {
  let summary: Summary | undefined;
  try {
    await db.transaction(async (tx) => {
      await prepare(tx);
      summary = await service.summary(
        tx,
        acme.organisation,
        acme.surveys.active.id,
        {},
      );
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  if (summary === undefined) throw new Error('The summary was not read');
  return summary;
}

describe('summary eligibility', () => {
  it('matches the seeded worked example: 2 of 4', async () => {
    const summary = await summaryAfter(async () => {});
    expect(summary.completion).toEqual({
      completed: 2,
      eligible: 4,
      rate: 2 / 4,
    });
  });

  it('keeps a respondent eligible after they are promoted to Manager', async () => {
    // Both seeded Acme respondents answered this week. Counting today's role only, the
    // denominator would drop to 2 (the Member deactivated mid-week and the Member who has
    // not answered) and the rate would be 1.
    const respondents = [
      acme.users.memberLongAgo.id,
      acme.users.memberMidWeek.id,
    ];
    const summary = await summaryAfter(async (tx) => {
      await tx
        .update(schema.users)
        .set({ role: 'manager' })
        .where(inArray(schema.users.id, respondents));
    });

    expect(summary.completion).toEqual({
      completed: 2,
      eligible: 4,
      rate: 2 / 4,
    });
    expect(summary.completion.rate).toBeLessThanOrEqual(1);
  });

  it('still does not count a Manager who did not respond', async () => {
    const summary = await summaryAfter(async (tx) => {
      await tx
        .update(schema.users)
        .set({ role: 'manager' })
        .where(eq(schema.users.id, acme.users.memberDeactivatedMidWeek.id));
    });

    expect(summary.completion).toEqual({
      completed: 2,
      eligible: 3,
      rate: 2 / 3,
    });
  });
});
