/**
 * The only module that calls `fetch`, so the cookie and the JSON headers are
 * decided once. Every function returns `ApiResult` and never throws: a parser
 * throw or a rejected fetch becomes a value at the app edge.
 *
 * Paths are relative and hardcoded, and no organisation id appears anywhere:
 * the API takes the organisation from the session cookie alone. The Vite proxy
 * makes every call same-origin, so the cookie is first-party.
 */

import {
  errorMessage,
  parseActiveSurvey,
  parseDevUsers,
  parseSessionState,
  parseSubmitResponse,
  parseSummary,
  parseSurveyList,
} from './parsers.js';
import type {
  ActiveSurveyPayload,
  AnswerInput,
  DevUser,
  SessionState,
  SubmitResponsePayload,
  Summary,
  SurveyListItem,
} from '@pulse/contracts';

export type Failure =
  | { kind: 'http'; status: number; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'malformed'; message: string };

export type ApiResult<T> =
  { ok: true; value: T } | { ok: false; failure: Failure };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown parsing error';
}

async function request<T>(
  path: string,
  init: RequestInit,
  parse: (value: unknown) => T,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    return {
      ok: false,
      failure: { kind: 'network', message: 'Could not reach the server.' },
    };
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return {
      ok: false,
      failure: {
        kind: 'http',
        status: response.status,
        message:
          errorMessage(body) ?? `Request failed with status ${response.status}`,
      },
    };
  }

  try {
    // A 204 has no body; its parser receives `undefined`.
    const body: unknown =
      response.status === 204 ? undefined : await response.json();
    return { ok: true, value: parse(body) };
  } catch (error) {
    return {
      ok: false,
      failure: { kind: 'malformed', message: messageOf(error) },
    };
  }
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function getSessionState(): Promise<ApiResult<SessionState>> {
  return request(
    '/api/me',
    { method: 'GET', cache: 'no-store' },
    parseSessionState,
  );
}

export function listDevUsers(): Promise<ApiResult<DevUser[]>> {
  return request(
    '/api/dev/users',
    { method: 'GET', cache: 'no-store' },
    parseDevUsers,
  );
}

export function signInWithDevUser(
  userId: string,
): Promise<ApiResult<SessionState>> {
  return request('/api/dev/sessions', jsonBody({ userId }), parseSessionState);
}

export function signOut(): Promise<ApiResult<void>> {
  return request('/api/sessions', { method: 'DELETE' }, () => undefined);
}

export function getActiveSurvey(): Promise<ApiResult<ActiveSurveyPayload>> {
  return request(
    '/api/surveys/active',
    { method: 'GET', cache: 'no-store' },
    parseActiveSurvey,
  );
}

export function submitResponse(
  surveyId: string,
  answers: AnswerInput[],
): Promise<ApiResult<SubmitResponsePayload>> {
  return request(
    `/api/surveys/${surveyId}/responses`,
    jsonBody({ answers }),
    parseSubmitResponse,
  );
}

/** Manager only. `GET /api/surveys` returns both statuses, newest first. */
export function listSurveys(): Promise<ApiResult<SurveyListItem[]>> {
  return request(
    '/api/surveys',
    { method: 'GET', cache: 'no-store' },
    parseSurveyList,
  );
}

/**
 * Manager only. `weekStart` is required and always the selected list item's
 * week, so the screen passes the week it is showing (contract section 5 ruling
 * 2). No organisation id appears in the path or query.
 */
export function getSummary(
  surveyId: string,
  weekStart: string,
): Promise<ApiResult<Summary>> {
  return request(
    `/api/surveys/${surveyId}/summary?weekStart=${encodeURIComponent(weekStart)}`,
    { method: 'GET', cache: 'no-store' },
    parseSummary,
  );
}
