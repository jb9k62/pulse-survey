import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MemberScreen from './MemberScreen.js';
import { jsonResponse, stubApi } from '../test/stub-fetch.js';

const week = {
  start: '2026-09-21',
  end: '2026-09-27',
  label: 'Mon 21 Sep to Sun 27 Sep',
};

const survey = {
  id: 's1',
  title: 'Weekly pulse',
  status: 'active',
  questions: [
    { id: 'q1', position: 1, type: 'rating', prompt: 'How are you?' },
    { id: 'q2', position: 2, type: 'yes_no', prompt: 'Did you rest?' },
    { id: 'q3', position: 3, type: 'rating', prompt: 'How is the team?' },
  ],
};

const activePayload = { survey, week, hasRespondedThisWeek: false };

async function renderWithSurvey(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  render(<MemberScreen />);
  await screen.findByText(week.label);
  await user.click(
    within(screen.getByRole('group', { name: 'How are you?' })).getByRole(
      'radio',
      { name: '4' },
    ),
  );
  await user.click(
    within(screen.getByRole('group', { name: 'Did you rest?' })).getByRole(
      'radio',
      { name: 'Yes' },
    ),
  );
  await user.click(
    within(screen.getByRole('group', { name: 'How is the team?' })).getByRole(
      'radio',
      { name: '5' },
    ),
  );
}

describe('MemberScreen', () => {
  it('renders the server week label and one field per question', async () => {
    stubApi([
      { method: 'GET', path: '/api/surveys/active', body: activePayload },
    ]);
    render(<MemberScreen />);

    expect(await screen.findByText(week.label)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Weekly pulse' }),
    ).toBeInTheDocument();

    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(3);
    expect(
      within(screen.getByRole('group', { name: 'How are you?' })).getAllByRole(
        'radio',
      ),
    ).toHaveLength(5);
    expect(
      within(screen.getByRole('group', { name: 'Did you rest?' })).getAllByRole(
        'radio',
      ),
    ).toHaveLength(2);
  });

  it('tells the Member which end of the rating scale is highest', async () => {
    stubApi([
      { method: 'GET', path: '/api/surveys/active', body: activePayload },
    ]);
    render(<MemberScreen />);
    await screen.findByText(week.label);

    expect(
      screen.getByRole('group', { name: 'How are you?' }),
    ).toHaveAccessibleDescription('1 is the lowest, 5 is the highest');
    expect(
      screen.getByRole('group', { name: 'Did you rest?' }),
    ).not.toHaveAccessibleDescription();
  });

  it('renders the empty state and still shows the week label', async () => {
    stubApi([
      {
        method: 'GET',
        path: '/api/surveys/active',
        body: { survey: null, week, hasRespondedThisWeek: false },
      },
    ]);
    render(<MemberScreen />);

    expect(await screen.findByText(week.label)).toBeInTheDocument();
    expect(
      screen.getByText('No survey is active this week.'),
    ).toBeInTheDocument();
  });

  it('submits the answers and shows the returned week label', async () => {
    const { calls } = stubApi([
      { method: 'GET', path: '/api/surveys/active', body: activePayload },
      {
        method: 'POST',
        path: '/api/surveys/s1/responses',
        status: 201,
        body: { response: { id: 'r1', week } },
      },
    ]);
    const user = userEvent.setup();
    await renderWithSurvey(user);

    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'POST',
        path: '/api/surveys/s1/responses',
        body: {
          answers: [
            { questionId: 'q1', rating: 4 },
            { questionId: 'q2', yesNo: true },
            { questionId: 'q3', rating: 5 },
          ],
        },
      });
    });
    expect(
      await screen.findByText(`Answers recorded for ${week.label}.`),
    ).toBeInTheDocument();
    // The outcome is newer than `hasRespondedThisWeek`, so the form closes.
    expect(
      screen.getByRole('button', { name: 'Submit answers' }),
    ).toBeDisabled();
    expect(screen.getByRole('group', { name: 'How are you?' })).toBeDisabled();
  });

  it('renders the duplicate sentence on a 409', async () => {
    stubApi([
      { method: 'GET', path: '/api/surveys/active', body: activePayload },
      {
        method: 'POST',
        path: '/api/surveys/s1/responses',
        status: 409,
        body: { message: ['You have already answered this survey this week.'] },
      },
    ]);
    const user = userEvent.setup();
    await renderWithSurvey(user);

    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(
      await screen.findByText('You have already answered this week.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit answers' }),
    ).toBeDisabled();
  });

  it('renders the joined API message on a 400 and keeps the button enabled', async () => {
    stubApi([
      { method: 'GET', path: '/api/surveys/active', body: activePayload },
      {
        method: 'POST',
        path: '/api/surveys/s1/responses',
        status: 400,
        body: { message: ['first problem', 'second problem'] },
      },
    ]);
    const user = userEvent.setup();
    await renderWithSurvey(user);

    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'first problem; second problem',
    );
    expect(
      screen.getByRole('button', { name: 'Submit answers' }),
    ).toBeEnabled();
  });

  it('renders a retry message when the submit fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST') {
          throw new Error('offline');
        }
        return jsonResponse(activePayload);
      },
    );
    const user = userEvent.setup();
    await renderWithSurvey(user);

    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the server.',
    );
    expect(
      screen.getByRole('button', { name: 'Submit answers' }),
    ).toBeEnabled();
  });

  it('renders the already-answered notice and keeps the form enabled', async () => {
    stubApi([
      {
        method: 'GET',
        path: '/api/surveys/active',
        body: { survey, week, hasRespondedThisWeek: true },
      },
    ]);
    render(<MemberScreen />);

    expect(
      await screen.findByText('You have already answered this week.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit answers' }),
    ).toBeEnabled();
  });
});
