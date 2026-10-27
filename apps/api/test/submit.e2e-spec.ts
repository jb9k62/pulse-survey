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

// A private organisation for this suite, in an unused id namespace. The submit tests write,
// so they must not touch a seeded organisation: the e2e files run in parallel against one
// `pulse_test`, and the summary and isolation suites assert the seeded Acme counts and
// `hasRespondedThisWeek` values.
const ORG_ID = 'd0000000-0000-4000-8000-000000000001';
const MANAGER_ID = 'd1000000-0000-4000-8000-000000000001';
const MEMBER_ONE_ID = 'd1000000-0000-4000-8000-000000000002';
const MEMBER_TWO_ID = 'd1000000-0000-4000-8000-000000000003';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Filled in `beforeAll` once the survey exists; the case builders read it at test time. */
const QIDS = { q1: '', q2: '', q3: '' };

function submitBody(answers: unknown[]): Record<string, unknown> {
  return { answers };
}

function validAnswers(): unknown[] {
  return [
    { questionId: QIDS.q1, rating: 5 },
    { questionId: QIDS.q2, yesNo: true },
    { questionId: QIDS.q3, rating: 4 },
  ];
}

const invalidAnswerCases: Array<[string, () => unknown[]]> = [
  ['empty answers', () => []],
  [
    'four answers',
    () => [...validAnswers(), { questionId: QIDS.q1, rating: 3 }],
  ],
  ['one question missing', () => validAnswers().slice(0, 2)],
  [
    'an unknown questionId',
    () => [
      ...validAnswers().slice(0, 2),
      { questionId: randomUUID(), rating: 3 },
    ],
  ],
  [
    'a duplicated questionId',
    () => [
      { questionId: QIDS.q1, rating: 5 },
      { questionId: QIDS.q1, rating: 4 },
      { questionId: QIDS.q3, rating: 3 },
    ],
  ],
  [
    'both rating and yesNo',
    () => [
      { questionId: QIDS.q1, rating: 5, yesNo: true },
      { questionId: QIDS.q2, yesNo: true },
      { questionId: QIDS.q3, rating: 4 },
    ],
  ],
  [
    'neither rating nor yesNo',
    () => [
      { questionId: QIDS.q1 },
      { questionId: QIDS.q2, yesNo: true },
      { questionId: QIDS.q3, rating: 4 },
    ],
  ],
  [
    'rating 0',
    () => [{ questionId: QIDS.q1, rating: 0 }, ...validAnswers().slice(1)],
  ],
  [
    'rating 6',
    () => [{ questionId: QIDS.q1, rating: 6 }, ...validAnswers().slice(1)],
  ],
  [
    'rating 3.5',
    () => [{ questionId: QIDS.q1, rating: 3.5 }, ...validAnswers().slice(1)],
  ],
  [
    'yesNo as a string',
    () => [
      { questionId: QIDS.q1, rating: 5 },
      { questionId: QIDS.q2, yesNo: 'yes' },
      { questionId: QIDS.q3, rating: 4 },
    ],
  ],
  [
    'a non-uuid questionId',
    () => [{ questionId: 'not-a-uuid', rating: 3 }, ...validAnswers().slice(1)],
  ],
];

// These pass the DTO shape and are caught by the service against the survey's question types.
const typeMismatchCases: Array<[string, () => unknown[]]> = [
  [
    'a rating value on the yes/no question',
    () => [
      { questionId: QIDS.q1, rating: 5 },
      { questionId: QIDS.q2, rating: 3 },
      { questionId: QIDS.q3, rating: 4 },
    ],
  ],
  [
    'a yesNo on a rating question',
    () => [
      { questionId: QIDS.q1, yesNo: true },
      { questionId: QIDS.q2, yesNo: true },
      { questionId: QIDS.q3, rating: 4 },
    ],
  ],
];

describe('responses (e2e)', () => {
  let app: INestApplication;
  let owner: Awaited<ReturnType<typeof ownerClient>>;
  let manager: SignInResult;
  let memberOne: SignInResult;
  let memberTwo: SignInResult;
  let currentWeek: string;
  let surveyId: string;
  let secondSurveyId: string;

  beforeAll(async () => {
    app = await createTestApp({ AUTH_MODE: 'dev' });
    owner = await ownerClient();

    await owner.query('insert into organisations (id, name) values ($1, $2)', [
      ORG_ID,
      'Responses Slice Test Org',
    ]);
    await owner.query(
      `insert into users (id, organisation_id, name, role, joined_at)
       values ($1, $4, $5, 'manager', now() - interval '30 days'),
              ($2, $4, $6, 'member', now() - interval '30 days'),
              ($3, $4, $7, 'member', now() - interval '30 days')`,
      [
        MANAGER_ID,
        MEMBER_ONE_ID,
        MEMBER_TWO_ID,
        ORG_ID,
        'Responses Slice Manager',
        'Responses Slice Member One',
        'Responses Slice Member Two',
      ],
    );

    manager = await signIn(app, MANAGER_ID);
    memberOne = await signIn(app, MEMBER_ONE_ID);
    memberTwo = await signIn(app, MEMBER_TWO_ID);

    const result = await owner.query<{ week_start: string }>(
      `select date_trunc('week', now() at time zone 'utc')::date::text as week_start`,
    );
    currentWeek = result.rows[0]!.week_start;

    const created = await request(app.getHttpServer())
      .post('/api/surveys')
      .set('Cookie', manager.cookie)
      .send({
        title: 'Responses slice pulse',
        questions: [
          { type: 'rating', prompt: 'How was your week?' },
          { type: 'yes_no', prompt: 'Did you get the support you needed?' },
          { type: 'rating', prompt: 'How clear were your priorities?' },
        ],
      })
      .expect(201);

    surveyId = created.body.survey.id as string;
    const questions = created.body.survey.questions as Array<{ id: string }>;
    QIDS.q1 = questions[0]!.id;
    QIDS.q2 = questions[1]!.id;
    QIDS.q3 = questions[2]!.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('answers 401 with no cookie on both routes', async () => {
    await request(app.getHttpServer())
      .post(`/api/surveys/${surveyId}/responses`)
      .send(submitBody(validAnswers()))
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/surveys/${surveyId}/summary`)
      .expect(401);
  });

  it('refuses the wrong role in both directions', async () => {
    await request(app.getHttpServer())
      .post(`/api/surveys/${surveyId}/responses`)
      .set('Cookie', manager.cookie)
      .send(submitBody(validAnswers()))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/surveys/${surveyId}/summary`)
      .set('Cookie', memberOne.cookie)
      .expect(403);
  });

  it('answers 400 for a malformed :id on both routes', async () => {
    const submitResponse = await request(app.getHttpServer())
      .post('/api/surveys/not-a-uuid/responses')
      .set('Cookie', memberOne.cookie)
      .send(submitBody(validAnswers()))
      .expect(400);
    expect(Array.isArray(submitResponse.body.message)).toBe(true);

    const summaryResponse = await request(app.getHttpServer())
      .get('/api/surveys/not-a-uuid/summary')
      .set('Cookie', manager.cookie)
      .expect(400);
    expect(Array.isArray(summaryResponse.body.message)).toBe(true);
  });

  it('answers 404 for a random uuid and another organisation survey, writing nothing', async () => {
    await request(app.getHttpServer())
      .post(`/api/surveys/${randomUUID()}/responses`)
      .set('Cookie', memberOne.cookie)
      .send(submitBody(validAnswers()))
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/surveys/${fixtures.acme.surveys.active.id}/responses`)
      .set('Cookie', memberOne.cookie)
      .send(submitBody(validAnswers()))
      .expect(404);

    const acmeRows = await owner.query<{ n: number }>(
      'select count(*)::int as n from responses where survey_id = $1',
      [fixtures.acme.surveys.active.id],
    );
    expect(Number(acmeRows.rows[0]!.n)).toBe(2);
  });

  it.each(invalidAnswerCases)(
    'rejects an invalid answer set: %s',
    async (_label, build) => {
      const response = await request(app.getHttpServer())
        .post(`/api/surveys/${surveyId}/responses`)
        .set('Cookie', memberOne.cookie)
        .send(submitBody(build()))
        .expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(Array.isArray(response.body.message)).toBe(true);
    },
  );

  it.each(typeMismatchCases)(
    'rejects a type mismatch: %s',
    async (_label, build) => {
      const response = await request(app.getHttpServer())
        .post(`/api/surveys/${surveyId}/responses`)
        .set('Cookie', memberOne.cookie)
        .send(submitBody(build()))
        .expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(Array.isArray(response.body.message)).toBe(true);
    },
  );

  it('accepts the first submit and writes the session row and three answers', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/surveys/${surveyId}/responses`)
      .set('Cookie', memberOne.cookie)
      .send({
        ...submitBody(validAnswers()),
        organisationId: fixtures.acme.organisation.id,
        userId: fixtures.acme.users.managerOne.id,
        role: 'manager',
        weekStart: '1999-01-04',
      })
      .expect(201);

    expect(response.body.response.id).toMatch(UUID);
    expect(response.body.response.week.start).toBe(currentWeek);

    const rows = await owner.query<{
      organisation_id: string;
      user_id: string;
      week_start: string;
    }>(
      `select organisation_id, user_id, week_start::text as week_start
       from responses where survey_id = $1`,
      [surveyId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      organisation_id: ORG_ID,
      user_id: MEMBER_ONE_ID,
      week_start: currentWeek,
    });
    expect(rows.rows[0]!.week_start).not.toBe('1999-01-04');

    const answerRows = await owner.query<{ n: number }>(
      'select count(*)::int as n from answers where response_id = $1',
      [response.body.response.id as string],
    );
    expect(Number(answerRows.rows[0]!.n)).toBe(3);
  });

  it('answers 409 for a second submit in the same week and writes no second row', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/surveys/${surveyId}/responses`)
      .set('Cookie', memberOne.cookie)
      .send(submitBody(validAnswers()))
      .expect(409);

    expect(response.body.statusCode).toBe(409);
    expect(String(response.body.message)).toContain('already');

    const rows = await owner.query<{ n: number }>(
      'select count(*)::int as n from responses where survey_id = $1 and user_id = $2',
      [surveyId, MEMBER_ONE_ID],
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);

    const answerRows = await owner.query<{ n: number }>(
      `select count(*)::int as n
       from answers a
       join responses r on r.id = a.response_id
       where r.survey_id = $1 and r.user_id = $2`,
      [surveyId, MEMBER_ONE_ID],
    );
    expect(Number(answerRows.rows[0]!.n)).toBe(3);
  });

  it('reports hasRespondedThisWeek for each member after the 201', async () => {
    const answered = await request(app.getHttpServer())
      .get('/api/surveys/active')
      .set('Cookie', memberOne.cookie)
      .expect(200);
    expect(answered.body.hasRespondedThisWeek).toBe(true);

    const unanswered = await request(app.getHttpServer())
      .get('/api/surveys/active')
      .set('Cookie', memberTwo.cookie)
      .expect(200);
    expect(unanswered.body.hasRespondedThisWeek).toBe(false);
  });

  it('accepts a second member of the same organisation for the same week', async () => {
    await request(app.getHttpServer())
      .post(`/api/surveys/${surveyId}/responses`)
      .set('Cookie', memberTwo.cookie)
      .send(
        submitBody([
          { questionId: QIDS.q1, rating: 3 },
          { questionId: QIDS.q2, yesNo: false },
          { questionId: QIDS.q3, rating: 4 },
        ]),
      )
      .expect(201);

    const rows = await owner.query<{ n: number }>(
      'select count(*)::int as n from responses where survey_id = $1',
      [surveyId],
    );
    expect(Number(rows.rows[0]!.n)).toBe(2);
  });

  it('answers 409 for an archived survey and writes no row for it', async () => {
    await request(app.getHttpServer())
      .patch(`/api/surveys/${surveyId}`)
      .set('Cookie', manager.cookie)
      .send({ status: 'archived' })
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/api/surveys')
      .set('Cookie', manager.cookie)
      .send({
        title: 'Responses slice successor',
        questions: [{ type: 'rating', prompt: 'Good week?' }],
      })
      .expect(201);
    secondSurveyId = created.body.survey.id as string;

    const archived = await request(app.getHttpServer())
      .post(`/api/surveys/${surveyId}/responses`)
      .set('Cookie', memberOne.cookie)
      .send(submitBody(validAnswers()))
      .expect(409);

    // memberOne already answered this survey this week, so the duplicate-week
    // branch would also produce 409. Asserting the archived message proves the
    // archived check fired, not the duplicate check.
    expect(String(archived.body.message)).toContain('archived');

    const rows = await owner.query<{ n: number }>(
      'select count(*)::int as n from responses where survey_id = $1',
      [surveyId],
    );
    expect(Number(rows.rows[0]!.n)).toBe(2);
    expect(secondSurveyId).toMatch(UUID);
  });
});
