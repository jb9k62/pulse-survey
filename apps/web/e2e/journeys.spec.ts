/**
 * The three two-organisation journeys from okf/pulse-surveys/frontend.md, run
 * against the seeded development stack.
 *
 * The tests run in declaration order (one worker, `fullyParallel: false`): the
 * Manager read journey first, then the Member write journey, then the
 * cross-organisation isolation journey. The submit journey uses Blue River
 * Member Mid Week and the read journey runs first because that submit turns
 * Blue River from 1 of 4 completed to 2 of 4, which would erase the "the titles
 * and numbers differ" proof (contract section 5, ruling 6).
 *
 * The fixture ids, names and titles below are copied from
 * apps/api/src/db/fixtures.ts. Importing them from apps/api would cross the
 * workspace boundary for one test, so they are hardcoded and a fixture rename
 * breaks this file loudly at the first assertion.
 */

import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { Page, TestInfo } from 'playwright/test';

const ACME_ORGANISATION = 'Acme Manufacturing';
const ACME_MANAGER = 'Acme Manager One';
const ACME_SURVEY_TITLE = 'Acme weekly pulse';
const ACME_SURVEY_ID = 'a2000000-0000-4000-8000-000000000001';

const BLUE_RIVER_ORGANISATION = 'Blue River Health';
const BLUE_RIVER_MANAGER = 'Blue River Manager One';
const BLUE_RIVER_MEMBER = 'Blue River Member Mid Week';
const BLUE_RIVER_ACTIVE_TITLE = 'Blue River weekly pulse';
const BLUE_RIVER_ARCHIVED_TITLE = 'Blue River onboarding pulse';
const BLUE_RIVER_ACTIVE_ID = 'b2000000-0000-4000-8000-000000000001';

const WEEK_LABEL =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2} to (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/;

const DUPLICATE_COPY = 'You have already answered this week.';

async function shoot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  // `testInfo.config.rootDir` is the resolved `testDir`, so this writes into
  // apps/web/e2e/screenshots/ without depending on the process cwd.
  await page.screenshot({
    path: join(testInfo.config.rootDir, 'screenshots', name),
    fullPage: true,
  });
}

async function signIn(
  page: Page,
  name: string,
  organisation: string,
): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  // The loud guard against reusing an API server started with AUTH_MODE=off.
  await expect(
    page.getByText('Sign-in is disabled in this environment'),
  ).toHaveCount(0);
  await page.getByRole('button', { name }).click();
  await expect(page.getByText(`${name} at ${organisation}`)).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

function weekOf(page: Page): Promise<string> {
  return page.locator('.week').innerText();
}

async function answerActiveSurvey(page: Page): Promise<void> {
  // The three groups of Blue River weekly pulse. The fieldset legend gives the
  // group its accessible name and `exact` avoids matching a substring.
  await page
    .getByRole('group', { name: 'How was your week?' })
    .getByRole('radio', { name: '2', exact: true })
    .check();
  await page
    .getByRole('group', { name: 'Did you get the support you needed?' })
    .getByRole('radio', { name: 'No', exact: true })
    .check();
  await page
    .getByRole('group', { name: 'How clear were your priorities?' })
    .getByRole('radio', { name: '2', exact: true })
    .check();
}

test('the Manager reads the Acme summary, then the Blue River summary', async ({
  page,
}, testInfo) => {
  await signIn(page, ACME_MANAGER, ACME_ORGANISATION);

  // The list is organisation scoped: one survey, and no Blue River survey.
  const acmePicker = page.locator('section.picker');
  await expect(acmePicker.getByRole('button')).toHaveCount(1);
  await expect(
    acmePicker.getByRole('button', { name: /Blue River/ }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: ACME_SURVEY_TITLE }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: ACME_SURVEY_TITLE }),
  ).toBeVisible();
  // The label comes from the server, so the test must not compute a date.
  await expect(page.locator('.week')).toHaveText(WEEK_LABEL);

  const acmeSummary = page.locator('.summary');
  await expect(acmeSummary).toContainText('2 of 4 members completed');
  await expect(acmeSummary).toContainText('50%');
  await expect(acmeSummary).toContainText(
    'average 4.5 out of 5 from 2 answers',
  );
  await expect(acmeSummary).toContainText('1 yes, 1 no');
  await expect(acmeSummary).toContainText(
    'average 3.5 out of 5 from 2 answers',
  );
  await expect(acmeSummary).not.toContainText('Blue River');
  await shoot(page, testInfo, 'manager-acme-summary.png');

  await signOut(page);

  await signIn(page, BLUE_RIVER_MANAGER, BLUE_RIVER_ORGANISATION);

  // Both statuses are listed (contract section 5, ruling 5) and no Acme survey
  // leaks into the list.
  const bluePicker = page.locator('section.picker');
  await expect(bluePicker.getByRole('button')).toHaveCount(2);
  await expect(
    bluePicker.getByRole('button', {
      name: new RegExp(BLUE_RIVER_ACTIVE_TITLE),
    }),
  ).toHaveCount(1);
  await expect(
    bluePicker.getByRole('button', {
      name: new RegExp(BLUE_RIVER_ARCHIVED_TITLE),
    }),
  ).toHaveCount(1);
  await expect(bluePicker.getByRole('button', { name: /Acme/ })).toHaveCount(0);

  await page.getByRole('button', { name: BLUE_RIVER_ACTIVE_TITLE }).click();
  const blueSummary = page.locator('.summary');
  await expect(blueSummary).toContainText('1 of 4 members completed');
  await expect(blueSummary).toContainText('25%');
  await expect(blueSummary).toContainText('average 5 out of 5 from 1 answer');
  await expect(blueSummary).toContainText('1 yes, 0 no');
  await expect(blueSummary).toContainText('average 4 out of 5 from 1 answer');
  await expect(blueSummary).not.toContainText('Acme');
  await shoot(page, testInfo, 'manager-blue-river-summary.png');

  // The archived survey has no responses, so the zero-answer summary renders
  // end to end. The seed has 4 eligible Members, never 0.
  await page.getByRole('button', { name: BLUE_RIVER_ARCHIVED_TITLE }).click();
  const archivedSummary = page.locator('.summary');
  await expect(archivedSummary).toContainText('0 of 4 members completed');
  await expect(archivedSummary).toContainText('0%');
  await expect(archivedSummary).toContainText('no answers yet');
  await expect(archivedSummary).toContainText('0 yes, 0 no');
});

test('the Member submits once and the second submit in the same week is a duplicate', async ({
  page,
}, testInfo) => {
  await signIn(page, BLUE_RIVER_MEMBER, BLUE_RIVER_ORGANISATION);

  await expect(
    page.getByRole('heading', { level: 1, name: BLUE_RIVER_ACTIVE_TITLE }),
  ).toBeVisible();
  await expect(page.locator('.week')).toHaveText(WEEK_LABEL);
  const weekLabel = (await weekOf(page)).trim();
  await expect(page.getByText(DUPLICATE_COPY)).toHaveCount(0);

  await answerActiveSurvey(page);
  const firstResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/responses'),
  );
  await page.getByRole('button', { name: 'Submit answers' }).click();
  const created = await firstResponse;
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as {
    response: { week: { label: string } };
  };
  expect(createdBody.response.week.label).toBe(weekLabel);
  await expect(page.locator('[aria-live="polite"]')).toContainText(
    `Answers recorded for ${weekLabel}.`,
  );
  await shoot(page, testInfo, 'member-submitted.png');

  // The reload reports `hasRespondedThisWeek`, which is not the 409 yet.
  await page.reload();
  await expect(page.getByText(DUPLICATE_COPY)).toHaveCount(1);

  // The reload emptied the radios and each group is required, so an empty
  // submit is blocked by the browser and no request is sent. Re-fill first.
  await answerActiveSurvey(page);
  const duplicateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/responses'),
  );
  await page.getByRole('button', { name: 'Submit answers' }).click();
  const duplicate = await duplicateResponse;
  expect(duplicate.status()).toBe(409);
  // Scoped to the live region: after the 409 the same sentence also renders
  // from `hasRespondedThisWeek`, so a page-wide locator would match twice.
  await expect(
    page.locator('[aria-live="polite"]').getByText(DUPLICATE_COPY),
  ).toBeVisible();
  await shoot(page, testInfo, 'member-duplicate-409.png');
});

test("a Manager cannot read another organisation's summary", async ({
  page,
}, testInfo) => {
  await signIn(page, ACME_MANAGER, ACME_ORGANISATION);

  // The id is valid for the Acme session, so the 404 below is tenancy and not
  // a typo. No organisation id is sent: only the session cookie differs.
  const acmeOwn = await page.request.get(
    `/api/surveys/${ACME_SURVEY_ID}/summary`,
  );
  expect(acmeOwn.status()).toBe(200);
  const acmeBody = (await acmeOwn.json()) as { survey: { title: string } };
  expect(acmeBody.survey.title).toBe(ACME_SURVEY_TITLE);

  await signOut(page);
  await signIn(page, BLUE_RIVER_MANAGER, BLUE_RIVER_ORGANISATION);
  await shoot(page, testInfo, 'manager-blue-river-isolation.png');

  const blueOwn = await page.request.get(
    `/api/surveys/${BLUE_RIVER_ACTIVE_ID}/summary`,
  );
  expect(blueOwn.status()).toBe(200);
  const blueBody = (await blueOwn.json()) as { survey: { title: string } };
  expect(blueBody.survey.title).toBe(BLUE_RIVER_ACTIVE_TITLE);

  const cross = await page.request.get(
    `/api/surveys/${ACME_SURVEY_ID}/summary`,
  );
  // 404, never 403: another organisation's id must not leak existence.
  expect(cross.status()).toBe(404);
  expect(await cross.text()).not.toContain('Acme');
});
