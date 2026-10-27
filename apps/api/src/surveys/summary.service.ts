import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Organisation,
  QuestionSummary,
  Summary,
  SummaryQuery,
} from '@pulse/contracts';
import type { TenantTx } from '../db/db.module.js';
import {
  completionOf,
  EMPTY_TALLY,
  ratingOf,
  yesNoOf,
} from './summary.math.js';
import { SurveysRepository } from './surveys.repository.js';
import { weekOf } from './week.js';

/**
 * The weekly summary. The repository runs the counting queries and `summary.math.ts` does
 * every division and the `avg()` conversion; this service only assembles the payload.
 */
@Injectable()
export class SummaryService {
  constructor(private readonly repository: SurveysRepository) {}

  async summary(
    tx: TenantTx,
    organisation: Organisation,
    surveyId: string,
    query: SummaryQuery,
  ): Promise<Summary> {
    const survey = await this.repository.findById(
      tx,
      organisation.id,
      surveyId,
    );

    if (survey === null) {
      // Another organisation's id is a 404, never a 403 (contract section 2.2 note 11).
      throw new NotFoundException();
    }

    const weekStart =
      query.weekStart ?? (await this.repository.currentWeekStart(tx));

    const completed = await this.repository.countResponses(
      tx,
      organisation.id,
      survey.id,
      weekStart,
    );
    const eligible = await this.repository.countEligible(
      tx,
      organisation.id,
      survey.id,
      weekStart,
    );
    const tallies = await this.repository.questionTallies(
      tx,
      organisation.id,
      survey.id,
      weekStart,
    );

    const questions: QuestionSummary[] = survey.questions.map((question) => {
      const tally = tallies.get(question.id) ?? EMPTY_TALLY;
      const base = {
        id: question.id,
        position: question.position,
        prompt: question.prompt,
      };
      return question.type === 'rating'
        ? { ...base, type: 'rating', ...ratingOf(tally) }
        : { ...base, type: 'yes_no', ...yesNoOf(tally) };
    });

    return {
      survey: { id: survey.id, title: survey.title, status: survey.status },
      week: weekOf(weekStart),
      completion: completionOf(completed, eligible),
      questions,
    };
  }
}
