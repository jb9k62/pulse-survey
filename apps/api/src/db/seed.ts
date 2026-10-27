import { inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { weekStartOf } from '../surveys/week.js';
import { fixtures, type FixtureOrganisation } from './fixtures.js';
import {
  answers,
  organisations,
  questions,
  responses,
  surveys,
  users,
} from './schema.js';

// The transaction handle `runSeed` passes to its helpers, derived from the driver
// so the helper signatures stay in step with drizzle-orm.
type SeedTransaction = Parameters<
  Parameters<NodePgDatabase['transaction']>[0]
>[0];

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(weekStart: string, offsetDays: number): Date {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

function earlier(first: Date, second: Date): Date {
  return first.getTime() <= second.getTime() ? first : second;
}

/** Insert the organisation, its users, its surveys and questions, and its responses. */
async function seedOrganisation(
  tx: SeedTransaction,
  fixture: FixtureOrganisation,
  now: Date,
  weekStart: string,
): Promise<void> {
  const orgId = fixture.organisation.id;
  const longAgo = new Date(now.getTime() - 30 * DAY_MS);
  const midWeekJoined = earlier(utcDay(weekStart, 2), now);

  await tx
    .insert(organisations)
    .values({ id: orgId, name: fixture.organisation.name })
    .onConflictDoNothing();

  const {
    managerOne,
    managerTwo,
    memberLongAgo,
    memberMidWeek,
    memberNotAnswered,
  } = fixture.users;
  const memberships = [
    { user: managerOne, joinedAt: longAgo, deactivatedAt: null },
    { user: managerTwo, joinedAt: longAgo, deactivatedAt: null },
    { user: memberLongAgo, joinedAt: longAgo, deactivatedAt: null },
    { user: memberMidWeek, joinedAt: midWeekJoined, deactivatedAt: null },
    { user: memberNotAnswered, joinedAt: longAgo, deactivatedAt: null },
    {
      user: fixture.users.memberDeactivatedBeforeWeek,
      joinedAt: longAgo,
      deactivatedAt: utcDay(weekStart, -1),
    },
    {
      user: fixture.users.memberDeactivatedMidWeek,
      joinedAt: longAgo,
      deactivatedAt: utcDay(weekStart, 2),
    },
  ];

  // joined_at and deactivated_at are relative to the current week, so a re-run in a later
  // week moves them. created_at moves too, because users_joined_at_check needs
  // joined_at <= created_at and the mid-week member can now have joined after the first run.
  await tx
    .insert(users)
    .values(
      memberships.map(({ user, joinedAt, deactivatedAt }) => ({
        id: user.id,
        organisationId: orgId,
        name: user.name,
        role: user.role,
        joinedAt,
        deactivatedAt,
      })),
    )
    .onConflictDoUpdate({
      target: users.id,
      set: {
        joinedAt: sql`excluded.joined_at`,
        deactivatedAt: sql`excluded.deactivated_at`,
        createdAt: now,
      },
    });

  const surveyFixtures = Object.values(fixture.surveys).filter(
    (survey): survey is NonNullable<typeof survey> => survey !== undefined,
  );

  await tx
    .insert(surveys)
    .values(
      surveyFixtures.map((survey) => ({
        id: survey.id,
        organisationId: orgId,
        title: survey.title,
        status: survey.status,
      })),
    )
    .onConflictDoNothing();

  const questionRows = surveyFixtures.flatMap((survey) =>
    Object.values(survey.questions).map((question) => ({
      id: question.id,
      organisationId: orgId,
      surveyId: survey.id,
      position: question.position,
      type: question.type,
      prompt: question.prompt,
    })),
  );

  await tx.insert(questions).values(questionRows).onConflictDoNothing();

  const responseRows = fixture.responses.map((response) => {
    const survey =
      response.survey === 'archived'
        ? fixture.surveys.archived
        : fixture.surveys.active;
    if (!survey) {
      throw new Error(`Fixture response ${response.id} names a missing survey`);
    }
    return {
      id: response.id,
      organisationId: orgId,
      surveyId: survey.id,
      userId: response.userId,
      weekStart,
    };
  });

  // The fixture responses belong to the current week. Delete them (answers first, since
  // the foreign key does not cascade) and insert them again, so a re-run in a later week
  // moves them instead of leaving them in the week they were first written. A response a
  // user submitted through the app this week wins over the fixture: the insert skips the
  // clash on the one-per-week key, and that fixture's answers are skipped with it.
  const fixtureResponseIds = responseRows.map((row) => row.id);
  await tx
    .delete(answers)
    .where(inArray(answers.responseId, fixtureResponseIds));
  await tx.delete(responses).where(inArray(responses.id, fixtureResponseIds));
  const inserted = await tx
    .insert(responses)
    .values(responseRows)
    .onConflictDoNothing()
    .returning({ id: responses.id });
  const insertedIds = new Set(inserted.map((row) => row.id));

  const answerRows = fixture.responses.flatMap((response) => {
    const survey =
      response.survey === 'archived'
        ? fixture.surveys.archived
        : fixture.surveys.active;
    if (!survey) {
      throw new Error(`Fixture response ${response.id} names a missing survey`);
    }
    return response.answers.map((answer) => ({
      id: answer.id,
      surveyId: survey.id,
      responseId: response.id,
      questionId: survey.questions[answer.question].id,
      ratingValue: answer.rating ?? null,
      yesNoValue: answer.yesNo ?? null,
    }));
  });

  const keptAnswers = answerRows.filter((row) =>
    insertedIds.has(row.responseId),
  );
  if (keptAnswers.length > 0) {
    await tx.insert(answers).values(keptAnswers);
  }
}

/**
 * Seed the two demo organisations. Runs as `pulse_owner`, which owns the tables and so is
 * exempt from RLS: that is what lets one transaction write rows for both organisations.
 * One transaction, so a failure leaves nothing behind.
 *
 * Safe to re-run: the fixture ids are fixed. Organisations, surveys and questions ignore
 * conflicts, so a survey archived through the app stays archived. The rows that depend on
 * the week (membership dates and the fixture responses with their answers) are rewritten
 * for the current week, so the demo numbers hold after a re-run in a later week.
 * `npm run db:reset` is still the way back to a clean database.
 */
export async function runSeed(ownerDb: NodePgDatabase): Promise<void> {
  // The database clock, not the host's: a join date clamped to the host clock can land a
  // millisecond after the column default for created_at, which users_joined_at_check rejects.
  const result = await ownerDb.execute<{ week_start: string; now: string }>(
    sql`select ${weekStartOf(sql`now()`)} as week_start, now() as now`,
  );
  const weekStart = result.rows[0]?.week_start;
  const nowText = result.rows[0]?.now;
  if (weekStart === undefined || nowText === undefined) {
    throw new Error('Could not read the current week from the database');
  }
  // The raw query returns the timestamp as text, which Date parses to millisecond precision.
  const now = new Date(nowText);

  await ownerDb.transaction(async (tx) => {
    await seedOrganisation(tx, fixtures.acme, now, weekStart);
    await seedOrganisation(tx, fixtures.blueRiver, now, weekStart);
  });
}
