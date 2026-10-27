import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import ManagerScreen from './ManagerScreen.js';
import { stubApi } from '../test/stub-fetch.js';

const week = {
  start: '2026-09-21',
  end: '2026-09-27',
  label: 'Mon 21 Sep to Sun 27 Sep',
};

const listPayload = {
  surveys: [
    {
      id: 's1',
      title: 'Weekly pulse',
      status: 'active',
      questionCount: 3,
      weekStart: '2026-09-21',
    },
    {
      id: 's2',
      title: 'Retro',
      status: 'archived',
      questionCount: 3,
      weekStart: '2026-09-21',
    },
  ],
};

const summaryPayload = {
  survey: { id: 's1', title: 'Weekly pulse', status: 'active' },
  week,
  completion: { completed: 2, eligible: 3, rate: 0.6666666666666666 },
  questions: [
    {
      id: 'q1',
      position: 1,
      type: 'rating',
      prompt: 'How are you?',
      average: 4.5,
      count: 2,
    },
    {
      id: 'q2',
      position: 2,
      type: 'yes_no',
      prompt: 'Did you rest?',
      yes: 1,
      no: 1,
    },
  ],
};

describe('ManagerScreen', () => {
  it('renders the list with status badges and requests no summary yet', async () => {
    const { calls } = stubApi([
      { method: 'GET', path: '/api/surveys', body: listPayload },
    ]);
    render(<ManagerScreen />);

    expect(
      await screen.findByRole('heading', { name: 'Surveys' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Weekly pulse')).toBeInTheDocument();
    expect(screen.getByText('Retro')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('archived')).toBeInTheDocument();

    expect(calls).toHaveLength(1);
    expect(calls.some((call) => call.path.endsWith('/summary'))).toBe(false);
  });

  it('requests the summary with the week and renders it on selection', async () => {
    const { calls } = stubApi([
      { method: 'GET', path: '/api/surveys', body: listPayload },
      {
        method: 'GET',
        path: '/api/surveys/s1/summary',
        search: '?weekStart=2026-09-21',
        body: summaryPayload,
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerScreen />);

    await user.click(
      await screen.findByRole('button', { name: /Weekly pulse/ }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Weekly pulse' }),
    ).toBeInTheDocument();
    expect(screen.getByText(week.label)).toBeInTheDocument();
    expect(screen.getByText('2 of 3 members completed')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('average 4.5 out of 5 from 2 answers')).toBeInTheDocument();
    expect(screen.getByText('1 yes, 1 no')).toBeInTheDocument();

    expect(calls).toContainEqual({
      method: 'GET',
      path: '/api/surveys/s1/summary',
      body: null,
    });
  });

  it('renders the empty state when the organisation has no surveys', async () => {
    stubApi([{ method: 'GET', path: '/api/surveys', body: { surveys: [] } }]);
    render(<ManagerScreen />);

    expect(await screen.findByText('No surveys yet.')).toBeInTheDocument();
  });

  it('shows a summary 404 honestly in an alert', async () => {
    stubApi([
      { method: 'GET', path: '/api/surveys', body: listPayload },
      {
        method: 'GET',
        path: '/api/surveys/s1/summary',
        search: '?weekStart=2026-09-21',
        status: 404,
        body: { message: ['Survey not found.'] },
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerScreen />);

    await user.click(
      await screen.findByRole('button', { name: /Weekly pulse/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Survey not found.',
    );
  });
});
