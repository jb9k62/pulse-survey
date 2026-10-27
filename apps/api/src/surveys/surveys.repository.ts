import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type {
  CreateSurveyRequest,
  SurveyDetail,
  SurveyListItem,
  SurveyStatus,
} from '@pulse/contracts';
import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { TenantTx } from '../db/db.module.js';
import { answers, questions, responses, surveys, users } from '../db/schema.js';
import type { QuestionTally } from './summary.math.js';
import { weekStartOf } from './week.js';

/**
 * A list row before the service fills the week. The list query carries no week: the
 * service calls `currentWeekStart` once and adds the same value to every row.
 */
export type SurveyListItemRow = Omit<SurveyListItem, 'weekStart'>;

/**
 * All survey, response and summary SQL. Every method takes the request transaction, and
 * every tenant query also filters by the organisation from the session, passed in as a
 * required argument (insertAnswers is the one exception, explained there). That filter is
 * defence in depth: the RLS policies already limit pulse_app to the caller's organisation
 * (see the RLS overview at the top of src/db/schema.ts), so a forgotten filter still leaks
 * nothing, and a policy that is too loose is still covered by the filter.
 *
 * A query on the pool instead of `tx` is a defect: it runs with no tenant settings, so
 * under RLS it sees no rows at all (and, as the owner, it would see every organisation).
 */
@Injectable()
export class SurveysRepository {
  /** The current week as `YYYY-MM-DD`, from the one place that computes a week. */
  // now() is the transaction start time, so every week read in one request agrees, even
  // across a Monday 00:00 UTC boundary.
  async currentWeekStart(tx: TenantTx): Promise<string> {
    const result = await tx.execute<{ week_start: string }>(
      sql`select ${weekStartOf(sql`now()`)} as week_start`,
    );
    const weekStart = result.rows[0]?.week_start;
    if (weekStart === undefined) {
      throw new InternalServerErrorException('Could not read the current week');
    }
    return weekStart;
  }

  /**
   * Insert the survey and its questions in the request transaction. The status is left to
   * the column default `'active'`. No `onConflictDoNothing`: a second active survey must
   * raise the `surveys_one_active_per_org` unique violation, which the service maps to 409.
   */
  async create(
    tx: TenantTx,
    organisationId: string,
    input: CreateSurveyRequest,
  ): Promise<SurveyDetail> {
    const [survey] = await tx
      .insert(surveys)
      .values({ organisationId, title: input.title })
      .returning({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
      });

    if (!survey) {
      throw new InternalServerErrorException(
        'The survey insert returned no row',
      );
    }

    const questionRows = await tx
      .insert(questions)
      .values(
        input.questions.map((question, index) => ({
          organisationId,
          surveyId: survey.id,
          position: index + 1,
          type: question.type,
          prompt: question.prompt,
        })),
      )
      .returning({
        id: questions.id,
        position: questions.position,
        type: questions.type,
        prompt: questions.prompt,
      });

    return {
      ...survey,
      questions: [...questionRows].sort(
        (first, second) => first.position - second.position,
      ),
    };
  }

  /** Every survey of the organisation, archived included, newest first. */
  async listForOrganisation(
    tx: TenantTx,
    organisationId: string,
  ): Promise<SurveyListItemRow[]> {
    return (
      tx
        .select({
          id: surveys.id,
          title: surveys.title,
          status: surveys.status,
          questionCount: count(questions.id),
        })
        .from(surveys)
        // Left join so a survey with no visible questions still lists, with a count of 0.
        .leftJoin(questions, eq(questions.surveyId, surveys.id))
        .where(eq(surveys.organisationId, organisationId))
        .groupBy(surveys.id, surveys.title, surveys.status)
        .orderBy(desc(surveys.createdAt), surveys.id)
    );
  }

  /**
   * The survey row plus its questions in position order. One private helper so the active
   * lookup and the by-id lookup cannot drift in the shape they return.
   */
  private async loadDetail(
    tx: TenantTx,
    organisationId: string,
    condition: SQL,
  ): Promise<SurveyDetail | null> {
    const [survey] = await tx
      .select({ id: surveys.id, title: surveys.title, status: surveys.status })
      .from(surveys)
      .where(and(eq(surveys.organisationId, organisationId), condition))
      .limit(1);

    if (!survey) {
      return null;
    }

    const questionRows = await tx
      .select({
        id: questions.id,
        position: questions.position,
        type: questions.type,
        prompt: questions.prompt,
      })
      .from(questions)
      .where(
        and(
          eq(questions.surveyId, survey.id),
          eq(questions.organisationId, organisationId),
        ),
      )
      .orderBy(questions.position);

    return { ...survey, questions: questionRows };
  }

  /** The one active survey of the organisation, with its questions, or `null`. */
  async findActive(
    tx: TenantTx,
    organisationId: string,
  ): Promise<SurveyDetail | null> {
    return this.loadDetail(tx, organisationId, eq(surveys.status, 'active'));
  }

  /**
   * One survey of the organisation by id, archived included, with its questions, or
   * `null`. No status filter: the submit path decides whether the status is a conflict and
   * the summary accepts an archived survey. Another organisation's id finds no row.
   */
  async findById(
    tx: TenantTx,
    organisationId: string,
    surveyId: string,
  ): Promise<SurveyDetail | null> {
    return this.loadDetail(tx, organisationId, eq(surveys.id, surveyId));
  }

  /**
   * Set the status of one survey of the organisation. A zero-row update is `null`, which
   * the service turns into a 404, never a 403 and never a probe query that could leak
   * existence. A second active survey raises the unique violation, not this method.
   */
  async setStatus(
    tx: TenantTx,
    organisationId: string,
    surveyId: string,
    status: SurveyStatus,
  ): Promise<SurveyListItemRow | null> {
    const [survey] = await tx
      .update(surveys)
      .set({ status })
      .where(
        and(
          eq(surveys.id, surveyId),
          eq(surveys.organisationId, organisationId),
        ),
      )
      .returning({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
      });

    if (!survey) {
      return null;
    }

    const [counted] = await tx
      .select({ questionCount: count(questions.id) })
      .from(questions)
      .where(
        and(
          eq(questions.surveyId, survey.id),
          eq(questions.organisationId, organisationId),
        ),
      );

    return { ...survey, questionCount: counted?.questionCount ?? 0 };
  }

  /**
   * Whether the member already answered this survey in the given week. For display only:
   * the unique constraint in insertResponse is what enforces one response a week.
   */
  async hasResponded(
    tx: TenantTx,
    organisationId: string,
    surveyId: string,
    userId: string,
    weekStart: string,
  ): Promise<boolean> {
    const [counted] = await tx
      .select({ responseCount: count(responses.id) })
      .from(responses)
      .where(
        and(
          eq(responses.organisationId, organisationId),
          eq(responses.surveyId, surveyId),
          eq(responses.userId, userId),
          eq(responses.weekStart, weekStart),
        ),
      );

    return (counted?.responseCount ?? 0) > 0;
  }

  /**
   * Insert one response, or return `null` when the member already answered this survey in
   * this week. The conflict target names only `responses_survey_id_user_id_week_start_unique`,
   * so no other constraint is swallowed and the service turns `null` into a 409.
   */
  async insertResponse(
    tx: TenantTx,
    input: {
      organisationId: string;
      surveyId: string;
      userId: string;
      weekStart: string;
    },
  ): Promise<string | null> {
    // ON CONFLICT DO NOTHING is race-safe: two concurrent submits both reach the unique
    // index, one inserts, the other gets no row back. No read-then-insert gap.
    const [inserted] = await tx
      .insert(responses)
      .values(input)
      .onConflictDoNothing({
        target: [responses.surveyId, responses.userId, responses.weekStart],
      })
      .returning({ id: responses.id });

    return inserted?.id ?? null;
  }

  /**
   * One answer row per question. The caller supplies survey and response ids, never the
   * body. No organisation argument: answers has no organisation_id, and its policy and
   * composite foreign keys tie each row to a response and question of the same survey.
   */
  async insertAnswers(
    tx: TenantTx,
    rows: Array<{
      surveyId: string;
      responseId: string;
      questionId: string;
      ratingValue: number | null;
      yesNoValue: boolean | null;
    }>,
  ): Promise<void> {
    await tx.insert(answers).values(rows);
  }

  // The summary queries. Each counts rows only; every ratio and the `avg()` conversion
  // live in `summary.math.ts`.

  /** Responses to one survey in one week. */
  async countResponses(
    tx: TenantTx,
    organisationId: string,
    surveyId: string,
    weekStart: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ completed: count(responses.id) })
      .from(responses)
      .where(
        and(
          eq(responses.organisationId, organisationId),
          eq(responses.surveyId, surveyId),
          eq(responses.weekStart, weekStart),
        ),
      );
    return row?.completed ?? 0;
  }

  /**
   * Eligible = Members who joined before the week ended and were not deactivated before
   * it started, plus anyone who responded to this survey that week. `role` is today's
   * role, so without the second branch a respondent later promoted to Manager would count
   * in `completed` but not here, and the rate could exceed 1. With it, every respondent
   * is in the denominator and `completed <= eligible` holds by construction.
   *
   * The window compares explicit UTC instants. The bare `date at time zone 'utc'` form
   * resolves to the `timestamptz -> timestamp` operator and would depend on the session
   * `TimeZone`, so both bounds are written as `::date::timestamp at time zone 'utc'`.
   */
  async countEligible(
    tx: TenantTx,
    organisationId: string,
    surveyId: string,
    weekStart: string,
  ): Promise<number> {
    // Half-open window [Monday 00:00 UTC, next Monday 00:00 UTC). `date + interval` is a
    // timestamp without time zone, so `at time zone 'utc'` reads it as UTC.
    const weekEndInstant = sql`(${weekStart}::date + interval '7 days') at time zone 'utc'`;
    const weekStartInstant = sql`${weekStart}::date::timestamp at time zone 'utc'`;

    // No organisation filter inside: the outer query already limits users to the
    // organisation, and a response's composite FK ties its user to the same organisation.
    const respondedThisWeek = sql`exists (
      select 1 from ${responses} r
      where r.user_id = ${users.id} and r.survey_id = ${surveyId} and r.week_start = ${weekStart}
    )`;
    const [row] = await tx
      .select({ eligible: count(users.id) })
      .from(users)
      .where(
        and(
          eq(users.organisationId, organisationId),
          or(
            and(
              eq(users.role, 'member'),
              lt(users.joinedAt, weekEndInstant),
              or(
                isNull(users.deactivatedAt),
                gte(users.deactivatedAt, weekStartInstant),
              ),
            ),
            respondedThisWeek,
          ),
        ),
      );
    return row?.eligible ?? 0;
  }

  /**
   * One raw tally per answered question. avg() and count(col) skip NULLs, so yes/no rows
   * do not affect the rating figures. `filter (where yes_no_value)` counts true only; the
   * `= false` filter counts false only (NULL matches neither).
   */
  async questionTallies(
    tx: TenantTx,
    organisationId: string,
    surveyId: string,
    weekStart: string,
  ): Promise<Map<string, QuestionTally>> {
    const rows = await tx
      .select({
        questionId: answers.questionId,
        ratingAverage: avg(answers.ratingValue),
        ratingCount: count(answers.ratingValue),
        yesCount:
          sql<number>`count(*) filter (where ${answers.yesNoValue})`.mapWith(
            Number,
          ),
        noCount:
          sql<number>`count(*) filter (where ${answers.yesNoValue} = false)`.mapWith(
            Number,
          ),
      })
      .from(answers)
      .innerJoin(responses, eq(responses.id, answers.responseId))
      .where(
        and(
          eq(answers.surveyId, surveyId),
          eq(responses.organisationId, organisationId),
          eq(responses.weekStart, weekStart),
        ),
      )
      .groupBy(answers.questionId);

    return new Map(
      rows.map(({ questionId, ...tally }): [string, QuestionTally] => [
        questionId,
        tally,
      ]),
    );
  }
}
