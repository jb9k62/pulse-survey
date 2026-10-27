import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtures } from '../src/db/fixtures.js';
import {
  createTestApp,
  ownerClient,
  signIn,
  type SignInResult,
} from './helpers/test-app.js';

const acme = fixtures.acme;
const blueRiver = fixtures.blueRiver;

interface QuestionSummaryBody {
  id: string;
  position: number;
  type: string;
  prompt: string;
  average?: number | null;
  count?: number;
  yes?: number;
  no?: number;
}

interface SummaryBody {
  survey: { id: string; title: string; status: string };
  week: { start: string; end: string; label: string };
  completion: { completed: number; eligible: number; rate: number | null };
  questions: QuestionSummaryBody[];
}

/**
 * Read-only, so it touches only the seeded organisations and runs safely beside the submit
 * suite. The seeded Acme week is the worked example: 2 completed, 4 eligible, rate 2/4.
 */
describe('summary (e2e)', () => {
  let app: INestApplication;
  let owner: Awaited<ReturnType<typeof ownerClient>>;
  let acmeManager: SignInResult;
  let acmeMember: SignInResult;
  let blueRiverManager: SignInResult;
  let currentWeek: string;
  let previousWeek: string;
  let nextWeek: string;
  let weekEnd: string;

  beforeAll(async () => {
    app = await createTestApp({ AUTH_MODE: 'dev' });
    owner = await ownerClient();
    acmeManager = await signIn(app, acme.users.managerOne.id);
    acmeMember = await signIn(app, acme.users.memberLongAgo.id);
    blueRiverManager = await signIn(app, blueRiver.users.managerOne.id);

    const weeks = await owner.query<{
      current_week: string;
      previous_week: string;
      next_week: string;
      week_end: string;
    }>(
      `select date_trunc('week', now() at time zone 'utc')::date::text as current_week,
              (date_trunc('week', now() at time zone 'utc')::date - 7)::text as previous_week,
              (date_trunc('week', now() at time zone 'utc')::date + 7)::text as next_week,
              (date_trunc('week', now() at time zone 'utc')::date + 6)::text as week_end`,
    );
    currentWeek = weeks.rows[0]!.current_week;
    previousWeek = weeks.rows[0]!.previous_week;
    nextWeek = weeks.rows[0]!.next_week;
    weekEnd = weeks.rows[0]!.week_end;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('answers 401 with no cookie and 403 for a member session', async () => {
    await request(app.getHttpServer())
      .get(`/api/surveys/${acme.surveys.active.id}/summary`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/surveys/${acme.surveys.active.id}/summary`)
      .set('Cookie', acmeMember.cookie)
      .expect(403);
  });

  it('answers 400 for a malformed :id and a bad weekStart', async () => {
    await request(app.getHttpServer())
      .get('/api/surveys/not-a-uuid/summary')
      .set('Cookie', acmeManager.cookie)
      .expect(400);

    for (const weekStart of ['not-a-date', '2026-9-21', '2026-09-22']) {
      const response = await request(app.getHttpServer())
        .get(`/api/surveys/${acme.surveys.active.id}/summary`)
        .query({ weekStart })
        .set('Cookie', acmeManager.cookie)
        .expect(400);
      expect(Array.isArray(response.body.message)).toBe(true);
    }
  });

  it('answers 404 for a random uuid and another organisation survey, both directions', async () => {
    await request(app.getHttpServer())
      .get(`/api/surveys/${randomUUID()}/summary`)
      .set('Cookie', acmeManager.cookie)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/surveys/${blueRiver.surveys.active.id}/summary`)
      .set('Cookie', acmeManager.cookie)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/surveys/${acme.surveys.active.id}/summary`)
      .set('Cookie', blueRiverManager.cookie)
      .expect(404);
  });

  it('returns the Acme worked example for the current week', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/surveys/${acme.surveys.active.id}/summary`)
      .set('Cookie', acmeManager.cookie)
      .expect(200);

    const body = response.body as SummaryBody;
    expect(body.survey).toEqual({
      id: acme.surveys.active.id,
      title: acme.surveys.active.title,
      status: 'active',
    });
    expect(body.week.start).toBe(currentWeek);
    expect(body.week.end).toBe(weekEnd);

    expect(body.completion.completed).toBe(2);
    expect(body.completion.eligible).toBe(4);
    expect(body.completion.rate).toBeCloseTo(2 / 4);
    expect(body.completion.rate).toBeLessThanOrEqual(1);

    expect(body.questions.map((question) => question.type)).toEqual([
      'rating',
      'yes_no',
      'rating',
    ]);
    expect(body.questions.map((question) => question.position)).toEqual([
      1, 2, 3,
    ]);

    const [first, second, third] = body.questions;
    expect(first).toMatchObject({ average: 4.5, count: 2 });
    expect(first).not.toHaveProperty('yes');
    expect(second).toMatchObject({ yes: 1, no: 1 });
    expect(second).not.toHaveProperty('average');
    expect(third).toMatchObject({ average: 3.5, count: 2 });
  });

  it('returns the Blue River counts, proving the summary is per organisation and survey', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/surveys/${blueRiver.surveys.active.id}/summary`)
      .set('Cookie', blueRiverManager.cookie)
      .expect(200);

    const body = response.body as SummaryBody;
    expect(body.survey.title).toBe(blueRiver.surveys.active.title);
    expect(body.completion.completed).toBe(1);
    expect(body.completion.eligible).toBe(4);
    expect(body.completion.rate).toBeCloseTo(1 / 4);

    const [first, second, third] = body.questions;
    expect(first).toMatchObject({ average: 5, count: 1 });
    expect(second).toMatchObject({ yes: 1, no: 0 });
    expect(third).toMatchObject({ average: 4, count: 1 });
  });

  it('returns a zero week with null averages, never NaN', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/surveys/${acme.surveys.active.id}/summary`)
      .query({ weekStart: previousWeek })
      .set('Cookie', acmeManager.cookie)
      .expect(200);

    const body = response.body as SummaryBody;
    expect(body.week.start).toBe(previousWeek);
    expect(body.completion.completed).toBe(0);
    expect(body.completion.eligible).toBe(4);
    expect(body.completion.rate).toBe(0);
    expect(Number.isNaN(body.completion.rate)).toBe(false);

    const [first, second, third] = body.questions;
    expect(first).toMatchObject({ average: null, count: 0 });
    expect(second).toMatchObject({ yes: 0, no: 0 });
    expect(third).toMatchObject({ average: null, count: 0 });
    for (const question of body.questions) {
      if (question.average !== undefined) {
        expect(Number.isNaN(question.average)).toBe(false);
      }
    }
  });

  // weekStart is a lookup key, not a boundary, so a future Monday is accepted and returns an
  // empty week. Eligible is 3: the member deactivated mid-week this week has left by then,
  // and no respondent adds to it.
  it('returns a zero week for a future Monday', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/surveys/${acme.surveys.active.id}/summary`)
      .query({ weekStart: nextWeek })
      .set('Cookie', acmeManager.cookie)
      .expect(200);

    const body = response.body as SummaryBody;
    expect(body.week.start).toBe(nextWeek);
    expect(body.completion).toEqual({ completed: 0, eligible: 3, rate: 0 });
    expect(body.questions[0]).toMatchObject({ average: null, count: 0 });
  });

  it('answers 200 for an archived survey with a zero week and every question present', async () => {
    const archivedId = blueRiver.surveys.archived!.id;
    const response = await request(app.getHttpServer())
      .get(`/api/surveys/${archivedId}/summary`)
      .set('Cookie', blueRiverManager.cookie)
      .expect(200);

    const body = response.body as SummaryBody;
    expect(body.survey.status).toBe('archived');
    expect(body.completion.eligible).toBe(4);
    expect(body.completion.completed).toBe(0);
    expect(body.questions).toHaveLength(3);
    expect(body.questions.map((question) => question.type)).toEqual([
      'rating',
      'yes_no',
      'rating',
    ]);
  });

  it('returns the same body for an explicit current Monday as for the default', async () => {
    const defaultResponse = await request(app.getHttpServer())
      .get(`/api/surveys/${acme.surveys.active.id}/summary`)
      .set('Cookie', acmeManager.cookie)
      .expect(200);

    const explicitResponse = await request(app.getHttpServer())
      .get(`/api/surveys/${acme.surveys.active.id}/summary`)
      .query({ weekStart: currentWeek })
      .set('Cookie', acmeManager.cookie)
      .expect(200);

    expect(explicitResponse.body).toEqual(defaultResponse.body);
  });
});
