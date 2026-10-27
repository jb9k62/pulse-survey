import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ActiveSurveyPayload,
  CreateSurveyPayload,
  CreateSurveyRequest,
  Organisation,
  PatchSurveyPayload,
  PatchSurveyRequest,
  SubmitResponsePayload,
  SubmitResponseRequest,
  SurveyListPayload,
} from '@pulse/contracts';
import type { TenantTx } from '../db/db.module.js';
import { isUniqueViolation } from '../db/pg-errors.js';
import { SurveysRepository } from './surveys.repository.js';
import { weekOf } from './week.js';

/**
 * A second active survey raises this partial unique index. Caught at the two writes that
 * can raise it, so the 409 is decided here and not in the global exception filter. After
 * the failed statement the transaction is aborted, and the throw rolls it back.
 */
const ONE_ACTIVE_SURVEY = 'surveys_one_active_per_org';

function rethrowAsConflict(error: unknown): never {
  if (isUniqueViolation(error, ONE_ACTIVE_SURVEY)) {
    throw new ConflictException(
      'This would create a second active survey for the organisation.',
    );
  }
  throw error;
}

/**
 * The week is composed only here, and only through `currentWeekStart` and `weekOf`.
 * Nothing else computes a week.
 */
@Injectable()
export class SurveysService {
  constructor(private readonly repository: SurveysRepository) {}

  async create(
    tx: TenantTx,
    organisation: Organisation,
    body: CreateSurveyRequest,
  ): Promise<CreateSurveyPayload> {
    const survey = await this.repository
      .create(tx, organisation.id, body)
      .catch(rethrowAsConflict);
    return { survey };
  }

  async list(
    tx: TenantTx,
    organisation: Organisation,
  ): Promise<SurveyListPayload> {
    const weekStart = await this.repository.currentWeekStart(tx);
    const rows = await this.repository.listForOrganisation(tx, organisation.id);
    return { surveys: rows.map((row) => ({ ...row, weekStart })) };
  }

  async activeForMember(
    tx: TenantTx,
    organisation: Organisation,
    userId: string,
  ): Promise<ActiveSurveyPayload> {
    const weekStart = await this.repository.currentWeekStart(tx);
    const survey = await this.repository.findActive(tx, organisation.id);

    if (survey === null) {
      return {
        survey: null,
        week: weekOf(weekStart),
        hasRespondedThisWeek: false,
      };
    }

    const hasRespondedThisWeek = await this.repository.hasResponded(
      tx,
      organisation.id,
      survey.id,
      userId,
      weekStart,
    );

    return { survey, week: weekOf(weekStart), hasRespondedThisWeek };
  }

  async patch(
    tx: TenantTx,
    organisation: Organisation,
    surveyId: string,
    body: PatchSurveyRequest,
  ): Promise<PatchSurveyPayload> {
    const row = await this.repository
      .setStatus(tx, organisation.id, surveyId, body.status)
      .catch(rethrowAsConflict);

    if (row === null) {
      throw new NotFoundException();
    }

    const weekStart = await this.repository.currentWeekStart(tx);
    return { survey: { ...row, weekStart } };
  }

  /**
   * Submit one response for the current week. The order is pinned and must not be
   * reordered: 404 (no survey for this organisation) -> 409 (archived) -> 400 (the answer
   * set does not match the survey) -> 409 (the duplicate week from the unique constraint).
   * The payload is judged against the survey before anything is written, so an invalid
   * body on a duplicate week is a 400, not a 409.
   */
  async submit(
    tx: TenantTx,
    organisation: Organisation,
    userId: string,
    surveyId: string,
    body: SubmitResponseRequest,
  ): Promise<SubmitResponsePayload> {
    const survey = await this.repository.findById(
      tx,
      organisation.id,
      surveyId,
    );

    if (survey === null) {
      // Unknown id or another organisation's id: 404, never 403.
      throw new NotFoundException();
    }

    if (survey.status === 'archived') {
      throw new ConflictException('This survey is archived.');
    }

    if (body.answers.length !== survey.questions.length) {
      throw new BadRequestException('Submit exactly one answer per question.');
    }

    // A duplicated questionId passes the length check (two copies of A with B missing)
    // and would then hit answers_response_id_question_id_unique as a 500.
    const uniqueQuestionIds = new Set(
      body.answers.map((answer) => answer.questionId),
    );
    if (uniqueQuestionIds.size !== body.answers.length) {
      throw new BadRequestException('Each question may be answered only once.');
    }

    const questionsById = new Map(
      survey.questions.map((question) => [question.id, question]),
    );
    for (const answer of body.answers) {
      const question = questionsById.get(answer.questionId);
      if (question === undefined) {
        throw new BadRequestException(
          'Every answer must name a question of this survey.',
        );
      }
      if (question.type === 'rating' && answer.rating === undefined) {
        throw new BadRequestException(
          'A rating question needs a rating value.',
        );
      }
      if (question.type === 'yes_no' && answer.yesNo === undefined) {
        throw new BadRequestException('A yes/no question needs a yesNo value.');
      }
    }

    const weekStart = await this.repository.currentWeekStart(tx);

    const responseId = await this.repository.insertResponse(tx, {
      organisationId: organisation.id,
      surveyId: survey.id,
      userId,
      weekStart,
    });

    if (responseId === null) {
      throw new ConflictException(
        'You have already answered this survey this week.',
      );
    }

    // The checks above prove the answers are exactly one per question of this survey.
    await this.repository.insertAnswers(
      tx,
      body.answers.map((answer) => ({
        surveyId: survey.id,
        responseId,
        questionId: answer.questionId,
        ratingValue: answer.rating ?? null,
        yesNoValue: answer.yesNo ?? null,
      })),
    );

    return { response: { id: responseId, week: weekOf(weekStart) } };
  }
}
