/**
 * The development sign-in picker. It is shown only when `/api/me` reports
 * `devSignIn: true`; otherwise it renders the pinned disabled copy from
 * contract section 3.2 and never calls `/api/dev/users`.
 */

import { useState, useTransition } from 'react';
import type { DevUser, Organisation } from '@pulse/contracts';
import { listDevUsers } from '../api/client.js';
import type { Failure } from '../api/client.js';
import { useApiResult } from '../hooks/useApiResult.js';
import { useSession } from '../session/session-context.js';

function roleLabel(role: DevUser['role']): string {
  return role === 'manager' ? 'Manager' : 'Member';
}

export default function SignInScreen({ devSignIn }: { devSignIn: boolean }) {
  const { signIn } = useSession();
  // `null` loads nothing: with the picker off, `/api/dev/users` is never called.
  const usersState = useApiResult(
    devSignIn ? { key: 'dev-users', load: listDevUsers } : null,
  );
  const [isPending, startTransition] = useTransition();
  const [signInFailure, setSignInFailure] = useState<Failure | null>(null);

  if (!devSignIn) {
    return (
      <section className="card page-narrow">
        <h1>Sign in</h1>
        <p className="muted">Sign-in is disabled in this environment</p>
      </section>
    );
  }

  const groups = new Map<
    string,
    { organisation: Organisation; users: DevUser[] }
  >();
  if (usersState.status === 'ready') {
    for (const user of usersState.value) {
      const group = groups.get(user.organisation.id);
      if (group === undefined) {
        groups.set(user.organisation.id, {
          organisation: user.organisation,
          users: [user],
        });
      } else {
        group.users.push(user);
      }
    }
  }

  function pick(userId: string): void {
    setSignInFailure(null);
    startTransition(async () => {
      const result = await signIn(userId);
      if (!result.ok) {
        // An update after an `await` needs its own transition (useTransition.md).
        startTransition(() => {
          setSignInFailure(result.failure);
        });
      }
    });
  }

  return (
    <section className="card">
      <header className="card-header">
        <p className="eyebrow">Development sign-in</p>
        <h1>Sign in</h1>
        <p className="muted">Pick a seeded user to continue.</p>
      </header>

      {usersState.status === 'loading' && (
        <p className="muted">Loading users</p>
      )}

      {usersState.status === 'failed' && (
        <p className="error" role="alert">
          {usersState.failure.message}
        </p>
      )}

      {signInFailure !== null && (
        <p className="error" role="alert">
          {signInFailure.message}
        </p>
      )}

      <div className="user-groups">
        {[...groups.values()].map((group) => (
          <section className="user-group" key={group.organisation.id}>
            <h2>{group.organisation.name}</h2>
            <ul className="list">
              {group.users.map((user) => (
                <li key={user.id}>
                  <button
                    className="list-button"
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      pick(user.id);
                    }}
                  >
                    {user.name}{' '}
                    <span className="badge">{roleLabel(user.role)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
