import type { INestApplication } from '@nestjs/common';
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

/**
 * Cross-organisation cases through the real API and a real session, so the app connects as
 * `pulse_app` and both layers are in play: the RLS policies and the repository's
 * organisation filter. Each case checks that org A cannot read or change org B's data and
 * that a foreign id is a 404, never a 403, so it does not confirm the id exists. The writes
 * are checked afterwards through the owner connection, which RLS does not hide rows from.
 * rls.spec.ts tests the policies alone.
 */
describe('tenant isolation (e2e)', () => {
  let app: INestApplication;
  let owner: Awaited<ReturnType<typeof ownerClient>>;
  let acmeManager: SignInResult;
  let acmeMember: SignInResult;
  let blueRiverManager: SignInResult;
  let blueRiverMember: SignInResult;

  beforeAll(async () => {
    app = await createTestApp({ AUTH_MODE: 'dev' });
    owner = await ownerClient();
    acmeManager = await signIn(app, acme.users.managerOne.id);
    acmeMember = await signIn(app, acme.users.memberLongAgo.id);
    blueRiverManager = await signIn(app, blueRiver.users.managerOne.id);
    blueRiverMember = await signIn(app, blueRiver.users.memberMidWeek.id);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('surveys', () => {
    it('lists only the session organisation surveys', async () => {
      const acmeList = await request(app.getHttpServer())
        .get('/api/surveys')
        .set('Cookie', acmeManager.cookie)
        .expect(200);
      const acmeIds = (acmeList.body.surveys as Array<{ id: string }>).map(
        (survey) => survey.id,
      );
      expect(acmeIds).toContain(acme.surveys.active.id);
      expect(acmeIds).not.toContain(blueRiver.surveys.active.id);
      expect(acmeIds).not.toContain(blueRiver.surveys.archived!.id);

      const blueList = await request(app.getHttpServer())
        .get('/api/surveys')
        .set('Cookie', blueRiverManager.cookie)
        .expect(200);
      const blueIds = (blueList.body.surveys as Array<{ id: string }>).map(
        (survey) => survey.id,
      );
      expect(blueIds).toContain(blueRiver.surveys.active.id);
      expect(blueIds).toContain(blueRiver.surveys.archived!.id);
      expect(blueIds).not.toContain(acme.surveys.active.id);
    });

    it('answers 404 on another organisation survey and leaves it unchanged', async () => {
      await request(app.getHttpServer())
        .patch(`/api/surveys/${blueRiver.surveys.active.id}`)
        .set('Cookie', acmeManager.cookie)
        .send({ status: 'archived' })
        .expect(404);

      const blueAfter = await owner.query<{ status: string }>(
        'select status from surveys where id = $1',
        [blueRiver.surveys.active.id],
      );
      expect(blueAfter.rows[0]?.status).toBe('active');

      await request(app.getHttpServer())
        .patch(`/api/surveys/${acme.surveys.active.id}`)
        .set('Cookie', blueRiverManager.cookie)
        .send({ status: 'archived' })
        .expect(404);

      const acmeAfter = await owner.query<{ status: string }>(
        'select status from surveys where id = $1',
        [acme.surveys.active.id],
      );
      expect(acmeAfter.rows[0]?.status).toBe('active');
    });

    it('answers 409 to a second active survey without touching another organisation', async () => {
      await request(app.getHttpServer())
        .post('/api/surveys')
        .set('Cookie', acmeManager.cookie)
        .send({
          title: 'Acme second pulse',
          questions: [{ type: 'rating', prompt: 'How was it?' }],
        })
        .expect(409);

      const counts = await owner.query<{ organisation_id: string; n: number }>(
        'select organisation_id, count(*)::int as n from surveys group by organisation_id',
      );
      const byOrganisation = new Map(
        counts.rows.map((row) => [row.organisation_id, Number(row.n)]),
      );
      expect(byOrganisation.get(acme.organisation.id)).toBe(1);
      expect(byOrganisation.get(blueRiver.organisation.id)).toBe(2);
    });

    it('returns only the session organisation active survey with the member state', async () => {
      const acmeActive = await request(app.getHttpServer())
        .get('/api/surveys/active')
        .set('Cookie', acmeMember.cookie)
        .expect(200);
      expect(acmeActive.body.survey.id).toBe(acme.surveys.active.id);
      expect(acmeActive.body.hasRespondedThisWeek).toBe(true);

      const blueActive = await request(app.getHttpServer())
        .get('/api/surveys/active')
        .set('Cookie', blueRiverMember.cookie)
        .expect(200);
      expect(blueActive.body.survey.id).toBe(blueRiver.surveys.active.id);
      expect(blueActive.body.survey.id).not.toBe(
        blueRiver.surveys.archived!.id,
      );
      expect(blueActive.body.hasRespondedThisWeek).toBe(false);
    });
  });

  describe('responses and summary', () => {
    it('answers 404 to a submit on another organisation active survey and writes nothing', async () => {
      await request(app.getHttpServer())
        .post(`/api/surveys/${blueRiver.surveys.active.id}/responses`)
        .set('Cookie', acmeMember.cookie)
        .send({
          answers: [
            {
              questionId: blueRiver.surveys.active.questions.first.id,
              rating: 3,
            },
          ],
        })
        .expect(404);

      const written = await owner.query<{ n: number }>(
        'select count(*)::int as n from responses where survey_id = $1 and user_id = $2',
        [blueRiver.surveys.active.id, acme.users.memberLongAgo.id],
      );
      expect(Number(written.rows[0]!.n)).toBe(0);
    });

    it('answers 404, not 409, to a submit on another organisation archived survey', async () => {
      await request(app.getHttpServer())
        .post(`/api/surveys/${blueRiver.surveys.archived!.id}/responses`)
        .set('Cookie', acmeMember.cookie)
        .send({
          answers: [
            {
              questionId: blueRiver.surveys.archived!.questions.first.id,
              rating: 3,
            },
          ],
        })
        .expect(404);
    });

    it('answers 404 to another organisation summary and reports the session organisation counts', async () => {
      await request(app.getHttpServer())
        .get(`/api/surveys/${blueRiver.surveys.active.id}/summary`)
        .set('Cookie', acmeManager.cookie)
        .expect(404);

      const own = await request(app.getHttpServer())
        .get(`/api/surveys/${acme.surveys.active.id}/summary`)
        .set('Cookie', acmeManager.cookie)
        .expect(200);
      expect(own.body.survey.title).toBe(acme.surveys.active.title);
      expect(own.body.completion.completed).toBe(2);
    });

    it('answers the reverse direction and reports the Blue River counts', async () => {
      await request(app.getHttpServer())
        .get(`/api/surveys/${acme.surveys.active.id}/summary`)
        .set('Cookie', blueRiverManager.cookie)
        .expect(404);

      const own = await request(app.getHttpServer())
        .get(`/api/surveys/${blueRiver.surveys.active.id}/summary`)
        .set('Cookie', blueRiverManager.cookie)
        .expect(200);
      expect(own.body.survey.title).toBe(blueRiver.surveys.active.title);
      expect(own.body.completion.completed).toBe(1);
    });
  });
});
