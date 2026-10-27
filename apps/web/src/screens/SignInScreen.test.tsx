import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import SignInScreen from './SignInScreen.js';
import SessionProvider from '../session/SessionProvider.js';
import { useSession } from '../session/session-context.js';
import { stubApi } from '../test/stub-fetch.js';

const signedOut = {
  signedIn: false,
  user: null,
  organisation: null,
  role: null,
  devSignIn: true,
};

const acmeMember = {
  signedIn: true,
  user: { id: 'u1', name: 'Ada' },
  organisation: { id: 'o1', name: 'Acme Manufacturing' },
  role: 'member',
  devSignIn: true,
};

const devUsers = {
  users: [
    {
      id: 'u1',
      name: 'Ada',
      role: 'member',
      organisation: { id: 'o1', name: 'Acme Manufacturing' },
    },
    {
      id: 'u2',
      name: 'Mia',
      role: 'manager',
      organisation: { id: 'o1', name: 'Acme Manufacturing' },
    },
    {
      id: 'u3',
      name: 'Ben',
      role: 'member',
      organisation: { id: 'o2', name: 'Blue River Health' },
    },
  ],
};

// Reads the session out of the provider so a test can prove the sign-in
// updated it. The provider also fetches /api/me, so every render stubs it.
function SessionProbe() {
  const { bootstrap } = useSession();
  if (bootstrap.status === 'ready' && bootstrap.session.signedIn) {
    return <p>signed in as {bootstrap.session.user.name}</p>;
  }
  return <p>probe idle</p>;
}

function renderScreen(devSignIn: boolean) {
  return render(
    <SessionProvider>
      <SignInScreen devSignIn={devSignIn} />
      <SessionProbe />
    </SessionProvider>,
  );
}

describe('SignInScreen', () => {
  it('groups users by organisation with a role badge', async () => {
    stubApi([
      { method: 'GET', path: '/api/me', body: signedOut },
      { method: 'GET', path: '/api/dev/users', body: devUsers },
    ]);
    renderScreen(true);

    expect(
      await screen.findByRole('heading', { name: 'Acme Manufacturing' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Blue River Health' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getAllByText('Member')).toHaveLength(2);
  });

  it('posts the chosen user id and shows the signed-in session', async () => {
    const { calls } = stubApi([
      { method: 'GET', path: '/api/me', body: signedOut },
      { method: 'GET', path: '/api/dev/users', body: devUsers },
      {
        method: 'POST',
        path: '/api/dev/sessions',
        status: 201,
        body: acmeMember,
      },
    ]);
    renderScreen(true);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Ada/ }));

    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'POST',
        path: '/api/dev/sessions',
        body: { userId: 'u1' },
      });
    });
    expect(await screen.findByText('signed in as Ada')).toBeInTheDocument();
  });

  it('shows the disabled copy and never lists dev users', async () => {
    const { calls } = stubApi([
      { method: 'GET', path: '/api/me', body: signedOut },
    ]);
    renderScreen(false);

    expect(
      await screen.findByText('Sign-in is disabled in this environment'),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.path === '/api/dev/users')).toBe(false);
  });

  it('shows a failed sign-in inline and stays signed out', async () => {
    stubApi([
      { method: 'GET', path: '/api/me', body: signedOut },
      { method: 'GET', path: '/api/dev/users', body: devUsers },
      {
        method: 'POST',
        path: '/api/dev/sessions',
        status: 404,
        body: { message: ['Unknown user'] },
      },
    ]);
    renderScreen(true);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Ada/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown user');
    expect(screen.getByText('probe idle')).toBeInTheDocument();
  });
});
