import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App.js';
import { stubApi } from './test/stub-fetch.js';

const week = {
  start: '2026-09-21',
  end: '2026-09-27',
  label: 'Mon 21 Sep to Sun 27 Sep',
};

const memberSession = {
  signedIn: true,
  user: { id: 'u1', name: 'Ada' },
  organisation: { id: 'o1', name: 'Acme Manufacturing' },
  role: 'member',
  devSignIn: true,
};

const managerSession = {
  signedIn: true,
  user: { id: 'm1', name: 'Grace' },
  organisation: { id: 'o1', name: 'Acme Manufacturing' },
  role: 'manager',
  devSignIn: true,
};

const surveyList = {
  surveys: [
    {
      id: 's1',
      title: 'Weekly pulse',
      status: 'active',
      questionCount: 3,
      weekStart: '2026-09-21',
    },
  ],
};

const activePayload = {
  survey: {
    id: 's1',
    title: 'Weekly pulse',
    status: 'active',
    questions: [
      { id: 'q1', position: 1, type: 'rating', prompt: 'How are you?' },
    ],
  },
  week,
  hasRespondedThisWeek: false,
};

function renderApp() {
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

describe('App', () => {
  it('goes from the bootstrap loading state to the member survey', async () => {
    stubApi([
      { method: 'GET', path: '/api/me', body: memberSession },
      { method: 'GET', path: '/api/surveys/active', body: activePayload },
    ]);
    renderApp();

    expect(screen.getByText('Loading your session')).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: 'Weekly pulse' }),
    ).toBeInTheDocument();
    expect(screen.getByText(week.label)).toBeInTheDocument();
    expect(screen.getByText('Ada at Acme Manufacturing')).toBeInTheDocument();
  });

  it('shows the picker when signed out with dev sign-in', async () => {
    stubApi([
      {
        method: 'GET',
        path: '/api/me',
        body: {
          signedIn: false,
          user: null,
          organisation: null,
          role: null,
          devSignIn: true,
        },
      },
      {
        method: 'GET',
        path: '/api/dev/users',
        body: {
          users: [
            {
              id: 'u1',
              name: 'Ada',
              role: 'member',
              organisation: { id: 'o1', name: 'Acme Manufacturing' },
            },
          ],
        },
      },
    ]);
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Acme Manufacturing' }),
    ).toBeInTheDocument();
  });

  it('shows the disabled copy when signed out without dev sign-in', async () => {
    stubApi([
      {
        method: 'GET',
        path: '/api/me',
        body: {
          signedIn: false,
          user: null,
          organisation: null,
          role: null,
          devSignIn: false,
        },
      },
    ]);
    renderApp();

    expect(
      await screen.findByText('Sign-in is disabled in this environment'),
    ).toBeInTheDocument();
  });

  it('renders the manager screen for a manager session', async () => {
    stubApi([
      { method: 'GET', path: '/api/me', body: managerSession },
      { method: 'GET', path: '/api/surveys', body: surveyList },
    ]);
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Surveys' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Weekly pulse')).toBeInTheDocument();
  });

  it('sends one DELETE when Sign out is double-clicked', async () => {
    const { calls } = stubApi([
      { method: 'GET', path: '/api/me', body: memberSession },
      { method: 'GET', path: '/api/surveys/active', body: activePayload },
      { method: 'DELETE', path: '/api/sessions', status: 204 },
      {
        method: 'GET',
        path: '/api/dev/users',
        body: {
          users: [
            {
              id: 'u1',
              name: 'Ada',
              role: 'member',
              organisation: { id: 'o1', name: 'Acme Manufacturing' },
            },
          ],
        },
      },
    ]);
    renderApp();

    // Two clicks in the same tick, before the DELETE can settle. user-event's dblClick
    // yields between the clicks, which lets the first sign-out finish and hides the race.
    const button = await screen.findByRole('button', { name: 'Sign out' });
    fireEvent.click(button);
    fireEvent.click(button);

    // Back on the picker, so the sign-out finished.
    expect(
      await screen.findByRole('heading', { name: 'Acme Manufacturing' }),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  });

  it('shows a bootstrap failure honestly', async () => {
    stubApi([
      {
        method: 'GET',
        path: '/api/me',
        status: 500,
        body: { message: ['The session store is unavailable'] },
      },
    ]);
    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The session store is unavailable',
    );
  });
});
