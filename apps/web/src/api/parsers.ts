/**
 * The only place a raw JSON payload is validated. `client.ts` calls these
 * functions once per response, so a malformed payload fails at the app edge
 * instead of becoming `undefined` deep inside a render.
 *
 * The schemas are the API's own, from `@pulse/contracts`, so a payload is
 * judged by the same contract the server builds it from. Each parser throws an
 * `Error` whose message names the payload and the offending field.
 */

import {
  activeSurveyPayloadSchema,
  devUsersPayloadSchema,
  sessionStateSchema,
  submitResponsePayloadSchema,
  summarySchema,
  surveyListPayloadSchema,
  type ActiveSurveyPayload,
  type DevUser,
  type SessionState,
  type SubmitResponsePayload,
  type Summary,
  type SurveyListItem,
} from '@pulse/contracts';
/**
 * The part of a Zod schema this module uses. Typed structurally so the web app
 * needs no direct `zod` import: the schemas bring their own copy.
 */
interface Schema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: readonly { path: readonly PropertyKey[]; message: string }[];
        };
      };
}

function parseWith<T>(
  schema: Schema<T>,
  payload: string,
): (value: unknown) => T {
  return (value) => {
    const result = schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    const issue = result.error.issues[0];
    const field =
      issue && issue.path.length > 0
        ? issue.path.map(String).join('.')
        : '(root)';
    throw new Error(`${payload}: ${field}: ${issue?.message ?? 'invalid'}`);
  };
}

export const parseSessionState: (value: unknown) => SessionState = parseWith(
  sessionStateSchema,
  'SessionState',
);

const parseDevUsersPayload = parseWith(devUsersPayloadSchema, 'DevUsers');
export function parseDevUsers(value: unknown): DevUser[] {
  return parseDevUsersPayload(value).users;
}

export const parseActiveSurvey: (value: unknown) => ActiveSurveyPayload =
  parseWith(activeSurveyPayloadSchema, 'ActiveSurvey');

export const parseSubmitResponse: (value: unknown) => SubmitResponsePayload =
  parseWith(submitResponsePayloadSchema, 'SubmitResponse');

const parseSurveyListPayload = parseWith(surveyListPayloadSchema, 'SurveyList');
export function parseSurveyList(value: unknown): SurveyListItem[] {
  return parseSurveyListPayload(value).surveys;
}

export const parseSummary: (value: unknown) => Summary = parseWith(
  summarySchema,
  'Summary',
);

/**
 * The contract 2.5 error body always carries `message: string[]`. This returns
 * the joined message, tolerates a bare string, and returns `null` for anything
 * else so the caller can fall back to its own copy.
 */
export function errorMessage(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const message = (value as { message?: unknown }).message;
  if (typeof message === 'string') {
    return message;
  }
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === 'string')
  ) {
    return message.join('; ');
  }
  return null;
}
