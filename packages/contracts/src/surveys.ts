import { z } from 'zod';
import { isWeekStart, weekSchema } from './week.js';

export const surveyStatusSchema = z.enum(['active', 'archived']);
export type SurveyStatus = z.infer<typeof surveyStatusSchema>;

export const questionTypeSchema = z.enum(['rating', 'yes_no']);
export type QuestionType = z.infer<typeof questionTypeSchema>;

// Requests. Unknown keys are stripped, not rejected, so an `organisationId`, `userId`,
// `role`, `position`, `status` or `weekStart` in a body is never read.

/**
 * The `:id` path parameter. A malformed id is a 400 at the edge, never a PostgreSQL
 * SQLSTATE 22P02.
 */
export const surveyIdSchema = z.uuid();

/** `POST /api/surveys` body. */
export const createSurveyRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  questions: z
    .array(
      z.object({
        type: questionTypeSchema,
        prompt: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(3),
});
export type CreateSurveyRequest = z.infer<typeof createSurveyRequestSchema>;

/** `PATCH /api/surveys/:id` body. Both statuses are accepted; the index rules on 409. */
export const patchSurveyRequestSchema = z.object({
  status: surveyStatusSchema,
});
export type PatchSurveyRequest = z.infer<typeof patchSurveyRequestSchema>;

/**
 * One answer. Exactly one of `rating` (an integer 1 to 5) or `yesNo`. Whether that matches
 * the question's type is the service's check, because it needs the survey row.
 */
export const answerSchema = z
  .object({
    questionId: z.uuid(),
    rating: z.int().min(1).max(5).optional(),
    yesNo: z.boolean().optional(),
  })
  .refine(
    (answer) => (answer.rating === undefined) !== (answer.yesNo === undefined),
    {
      message: 'each answer must carry exactly one of rating or yesNo',
    },
  );
export type AnswerInput = z.infer<typeof answerSchema>;

/** `POST /api/surveys/:id/responses` body. */
export const submitResponseRequestSchema = z.object({
  answers: z.array(answerSchema).min(1).max(3),
});
export type SubmitResponseRequest = z.infer<typeof submitResponseRequestSchema>;

/**
 * The optional summary `weekStart`. `isWeekStart` rejects a malformed date and a
 * non-Monday, so one refine covers the whole rule. The value is a lookup key for a stored
 * `date`, never a boundary.
 */
export const summaryQuerySchema = z.object({
  weekStart: z
    .string()
    .refine(isWeekStart, {
      message: 'weekStart must be a Monday in YYYY-MM-DD form',
    })
    .optional(),
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

// Responses.

export const surveyQuestionSchema = z.object({
  id: z.string(),
  position: z.number(),
  type: questionTypeSchema,
  prompt: z.string(),
});
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;

export const surveyDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: surveyStatusSchema,
  questions: z.array(surveyQuestionSchema),
});
export type SurveyDetail = z.infer<typeof surveyDetailSchema>;

/** `POST /api/surveys` response. */
export const createSurveyPayloadSchema = z.object({
  survey: surveyDetailSchema,
});
export type CreateSurveyPayload = z.infer<typeof createSurveyPayloadSchema>;

/** One row of `GET /api/surveys`. */
export const surveyListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: surveyStatusSchema,
  questionCount: z.number(),
  weekStart: z.string(),
});
export type SurveyListItem = z.infer<typeof surveyListItemSchema>;

/** `GET /api/surveys`: both statuses, newest first. */
export const surveyListPayloadSchema = z.object({
  surveys: z.array(surveyListItemSchema),
});
export type SurveyListPayload = z.infer<typeof surveyListPayloadSchema>;

/** `PATCH /api/surveys/:id` response. */
export const patchSurveyPayloadSchema = z.object({
  survey: surveyListItemSchema,
});
export type PatchSurveyPayload = z.infer<typeof patchSurveyPayloadSchema>;

/** `GET /api/surveys/active`. */
export const activeSurveyPayloadSchema = z.object({
  survey: surveyDetailSchema.nullable(),
  week: weekSchema,
  hasRespondedThisWeek: z.boolean(),
});
export type ActiveSurveyPayload = z.infer<typeof activeSurveyPayloadSchema>;

/** `POST /api/surveys/:id/responses`, 201. */
export const submitResponsePayloadSchema = z.object({
  response: z.object({ id: z.string(), week: weekSchema }),
});
export type SubmitResponsePayload = z.infer<typeof submitResponsePayloadSchema>;

// `z.number()` rejects NaN and the infinities, so a summary can never carry one into a
// render. A ratio that is undefined is JSON `null`.

/** A rating question in the summary. `average` is null when `count` is 0. */
export const ratingQuestionSummarySchema = z.object({
  id: z.string(),
  position: z.number(),
  type: z.literal('rating'),
  prompt: z.string(),
  average: z.number().nullable(),
  count: z.number(),
});
export type RatingQuestionSummary = z.infer<typeof ratingQuestionSummarySchema>;

export const yesNoQuestionSummarySchema = z.object({
  id: z.string(),
  position: z.number(),
  type: z.literal('yes_no'),
  prompt: z.string(),
  yes: z.number(),
  no: z.number(),
});
export type YesNoQuestionSummary = z.infer<typeof yesNoQuestionSummarySchema>;

/** A rating question must not carry `yes`/`no`, a yes/no question not `average`/`count`. */
export const questionSummarySchema = z.discriminatedUnion('type', [
  ratingQuestionSummarySchema,
  yesNoQuestionSummarySchema,
]);
export type QuestionSummary = z.infer<typeof questionSummarySchema>;

/** `GET /api/surveys/:id/summary`. `rate` is a fraction, and null with zero eligible. */
export const summarySchema = z.object({
  survey: z.object({
    id: z.string(),
    title: z.string(),
    status: surveyStatusSchema,
  }),
  week: weekSchema,
  completion: z.object({
    completed: z.number(),
    eligible: z.number(),
    rate: z.number().nullable(),
  }),
  questions: z.array(questionSummarySchema),
});
export type Summary = z.infer<typeof summarySchema>;
