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

// A private organisation for this suite, in an unused id namespace. It must not be Acme or
// Blue River: the e2e files run in parallel against one `pulse_test`, and the isolation,
// submit and summary suites read the seeded organisations.
const ORG_ID = 'c0000000-0000-4000-8000-000000000001';
const MANAGER_ID = 'c1000000-0000-4000-8000-000000000001';
const MEMBER_ID = 'c1000000-0000-4000-8000-000000000002';

type JsonBody = Record<string, unknown>;

const invalidCreateBodies: Array<[string, JsonBody]> = [
  ['zero questions', { title: 'Monday pulse', questions: [] }],
  [
    'four questions',
    {
      title: 'Monday pulse',
      questions: Array.from({ length: 4 }, () => ({
        type: 'rating',
        prompt: 'How was it?',
      })),
    },
  ],
  [
    'unknown type',
    {
      title: 'Monday pulse',
      questions: [{ type: 'stars', prompt: 'How was it?' }],
    },
  ],
  [
    '121-character title',
    {
      title: 'a'.repeat(121),
      questions: [{ type: 'rating', prompt: 'How was it?' }],
    },
  ],
  [
    'whitespace-only title',
    { title: '   ', questions: [{ type: 'rating', prompt: 'How was it?' }] },
  ],
  ['missing title', { questions: [{ type: 'rating', prompt: 'How was it?' }] }],
  [
    'empty prompt',
    { title: 'Monday pulse', questions: [{ type: 'rating', prompt: '   ' }] },
  ],
];

const invalidPatchBodies: Array<[string, JsonBody]> = [
  ['empty body', {}],
  ['unknown status', { status: 'deleted' }],
];

describe('surveys (e2e)', () => {
  let app: INestApplication;
  let owner: Awaited<ReturnType<typeof ownerClient>>;
  let manager: SignInResult;
  let member: SignInResult;
  let acmeManager: SignInResult;
  let currentWeek: string;
  let createdSurveyId: string;
  let secondSurveyId: string;

  beforeAll(async () => {
    app = await createTestApp({ AUTH_MODE: 'dev' });
    owner = await ownerClient();

    await owner.query('insert into organisations (id, name) values ($1, $2)', [
      ORG_ID,
      'Surveys Slice Test Org',
    ]);
    // `users_joined_at_check` requires joined_at <= created_at, and created_at defaults to now().
    await owner.query(
      `insert into users (id, organisation_id, name, role, joined_at)
       values ($1, $3, $4, 'manager', now() - interval '30 days'),
              ($2, $3, $5, 'member', now() - interval '30 days')`,
      [
        MANAGER_ID,
        MEMBER_ID,
        ORG_ID,
        'Surveys Slice Manager',
        'Surveys Slice Member',
      ],
    );

    manager = await signIn(app, MANAGER_ID);
    member = await signIn(app, MEMBER_ID);
    acmeManager = await signIn(app, fixtures.acme.users.managerOne.id);

    const result = await owner.query<{ week_start: string }>(
      `select date_trunc('week', now() at time zone 'utc')::date::text as week_start`,
    );
    currentWeek = result.rows[0]!.week_start;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('answers 401 with no cookie on all four routes', async () => {
    await request(app.getHttpServer()).get('/api/surveys').expect(401);
    await request(app.getHttpServer()).get('/api/surveys/active').expect(401);
    await request(app.getHttpServer())
      .post('/api/surveys')
      .send({ title: 'Monday pulse', questions: [] })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/surveys/${randomUUID()}`)
      .send({ status: 'archived' })
      .expect(401);
  });

  it('refuses the wrong role with 403', async () => {
    await request(app.getHttpServer())
      .get('/api/surveys')
      .set('Cookie', member.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/surveys')
      .set('Cookie', member.cookie)
      .send({
        title: 'Monday pulse',
        questions: [{ type: 'rating', prompt: 'How was it?' }],
      })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/surveys/${randomUUID()}`)
      .set('Cookie', member.cookie)
      .send({ status: 'archived' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/surveys/active')
      .set('Cookie', manager.cookie)
      .expect(403);
  });

  it.each(invalidCreateBodies)(
    'rejects a create body: %s',
    async (_label, body) => {
      const response = await request(app.getHttpServer())
        .post('/api/surveys')
        .set('Cookie', manager.cookie)
        .send(body)
        .expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(Array.isArray(response.body.message)).toBe(true);
    },
  );

  it.each(invalidPatchBodies)(
    'rejects a PATCH body: %s',
    async (_label, body) => {
      // A random id, so nothing can be written even if the body somehow reached the handler.
      const response = await request(app.getHttpServer())
        .patch(`/api/surveys/${randomUUID()}`)
        .set('Cookie', manager.cookie)
        .send(body)
        .expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(Array.isArray(response.body.message)).toBe(true);
    },
  );

  it('answers 400 for a malformed :id, never a 500', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/surveys/not-a-uuid')
      .set('Cookie', manager.cookie)
      .send({ status: 'archived' })
      .expect(400);

    expect(response.body.statusCode).toBe(400);
    expect(Array.isArray(response.body.message)).toBe(true);
  });

  it('answers 404 for an unknown id and another organisation survey, without writing', async () => {
    await request(app.getHttpServer())
      .patch(`/api/surveys/${randomUUID()}`)
      .set('Cookie', manager.cookie)
      .send({ status: 'archived' })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/surveys/${fixtures.acme.surveys.active.id}`)
      .set('Cookie', manager.cookie)
      .send({ status: 'archived' })
      .expect(404);

    const result = await owner.query<{ status: string }>(
      'select status from surveys where id = $1',
      [fixtures.acme.surveys.active.id],
    );
    expect(result.rows[0]?.status).toBe('active');
  });

  it('returns the empty active payload with the database current week', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/surveys/active')
      .set('Cookie', member.cookie)
      .expect(200);

    expect(response.body.survey).toBeNull();
    expect(response.body.hasRespondedThisWeek).toBe(false);
    expect(response.body.week.start).toBe(currentWeek);
  });

  it('creates a survey with its questions and strips the extra body keys', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/surveys')
      .set('Cookie', manager.cookie)
      .send({
        title: '  Weekly pulse  ',
        questions: [
          { type: 'rating', prompt: 'How was your week?' },
          { type: 'yes_no', prompt: 'Did you get the support you needed?' },
          { type: 'rating', prompt: 'How clear were your priorities?' },
        ],
        organisationId: fixtures.acme.organisation.id,
        status: 'archived',
        weekStart: '1999-01-04',
      })
      .expect(201);

    const survey = response.body.survey as {
      id: string;
      title: string;
      status: string;
      questions: Array<{ position: number; type: string; prompt: string }>;
    };
    createdSurveyId = survey.id;
    expect(survey.title).toBe('Weekly pulse');
    expect(survey.status).toBe('active');
    expect(survey.questions.map((question) => question.position)).toEqual([
      1, 2, 3,
    ]);
    expect(survey.questions.map((question) => question.type)).toEqual([
      'rating',
      'yes_no',
      'rating',
    ]);

    // The body's organisation id was stripped: Acme's manager gets 404 for the new id.
    await request(app.getHttpServer())
      .patch(`/api/surveys/${createdSurveyId}`)
      .set('Cookie', acmeManager.cookie)
      .send({ status: 'archived' })
      .expect(404);
  });

  it('answers 409 for a second active survey and writes nothing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/surveys')
      .set('Cookie', manager.cookie)
      .send({
        title: 'Second pulse',
        questions: [{ type: 'rating', prompt: 'How was it?' }],
      })
      .expect(409);

    expect(response.body.statusCode).toBe(409);

    const list = await request(app.getHttpServer())
      .get('/api/surveys')
      .set('Cookie', manager.cookie)
      .expect(200);
    expect(list.body.surveys).toHaveLength(1);
  });

  it('lists the survey with its question count and the current week', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/surveys')
      .set('Cookie', manager.cookie)
      .expect(200);

    const surveys = response.body.surveys as Array<{
      id: string;
      status: string;
      questionCount: number;
      weekStart: string;
    }>;
    expect(surveys.map((survey) => survey.id)).toContain(createdSurveyId);

    const item = surveys.find((survey) => survey.id === createdSurveyId)!;
    expect(item.questionCount).toBe(3);
    expect(item.status).toBe('active');
    expect(item.weekStart).toBe(currentWeek);
  });

  it('archives a survey, after which the active endpoint reports none', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/surveys/${createdSurveyId}`)
      .set('Cookie', manager.cookie)
      .send({ status: 'archived' })
      .expect(200);

    expect(response.body.survey.status).toBe('archived');
    expect(response.body.survey.questionCount).toBe(3);
    expect(response.body.survey.weekStart).toBe(currentWeek);

    const active = await request(app.getHttpServer())
      .get('/api/surveys/active')
      .set('Cookie', member.cookie)
      .expect(200);
    expect(active.body.survey).toBeNull();

    const list = await request(app.getHttpServer())
      .get('/api/surveys')
      .set('Cookie', manager.cookie)
      .expect(200);
    const item = (
      list.body.surveys as Array<{ id: string; status: string }>
    ).find((survey) => survey.id === createdSurveyId)!;
    expect(item.status).toBe('archived');
  });

  it('creates a new active survey after the archive and the member sees it', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/surveys')
      .set('Cookie', manager.cookie)
      .send({
        title: 'Weekly pulse two',
        questions: [{ type: 'yes_no', prompt: 'Good week?' }],
      })
      .expect(201);

    secondSurveyId = response.body.survey.id as string;

    const active = await request(app.getHttpServer())
      .get('/api/surveys/active')
      .set('Cookie', member.cookie)
      .expect(200);
    expect(active.body.survey.id).toBe(secondSurveyId);
    expect(active.body.hasRespondedThisWeek).toBe(false);
  });

  it('refuses a second active survey then reactivates after archiving it', async () => {
    await request(app.getHttpServer())
      .patch(`/api/surveys/${createdSurveyId}`)
      .set('Cookie', manager.cookie)
      .send({ status: 'active' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/surveys/${secondSurveyId}`)
      .set('Cookie', manager.cookie)
      .send({ status: 'archived' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .patch(`/api/surveys/${createdSurveyId}`)
      .set('Cookie', manager.cookie)
      .send({ status: 'active' })
      .expect(200);
    expect(response.body.survey.status).toBe('active');
  });
});
